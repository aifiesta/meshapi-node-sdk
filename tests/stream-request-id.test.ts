/**
 * `SSEStream.requestId` + the mid-stream error-frame fallback.
 *
 * Reported by a customer on 1.0.4: with several streams in flight, the
 * client-level `onResponse` hook cannot say which response belongs to which
 * call, and errors raised from a mid-stream error frame arrived with
 * `requestId: ""`. No live server required.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { MeshAPI, MeshAPIApiError } from "../src/index.js";

const BASE = "https://api.meshapi.test";
const TOKEN = "rsk_test";

function sseResponse(payloads: unknown[], requestId?: string): Response {
  const text = payloads
    .map((p) => `data: ${typeof p === "string" ? p : JSON.stringify(p)}\n\n`)
    .join("");
  const headers: Record<string, string> = { "content-type": "text/event-stream" };
  if (requestId) headers["x-request-id"] = requestId;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode(text));
      c.close();
    },
  });
  return new Response(stream, { status: 200, headers });
}

const chunk = { choices: [{ delta: { content: "hi" }, finish_reason: null }] };

function client(fetchImpl: typeof fetch): MeshAPI {
  return new MeshAPI({ baseUrl: BASE, token: TOKEN, fetch: fetchImpl });
}

async function drain(stream: AsyncIterable<unknown>): Promise<unknown[]> {
  const out: unknown[] = [];
  for await (const c of stream) out.push(c);
  return out;
}

describe("SSEStream.requestId", () => {
  it("resolves to the response's x-request-id", async () => {
    const c = client(async () => sseResponse([chunk, "[DONE]"], "req_stream_1"));
    const stream = c.chat.completions.create({
      model: "m",
      messages: [{ role: "user", content: "hi" }],
      stream: true,
    });

    assert.equal(await stream.requestId, "req_stream_1");
    assert.equal((await drain(stream)).length, 1);
  });

  it("distinguishes concurrent streams — the reported bug", async () => {
    // The whole point: three identical POSTs, correlated without a hook.
    let n = 0;
    const c = client(async () => sseResponse([chunk, "[DONE]"], `req_${++n}`));

    const streams = [1, 2, 3].map(() =>
      c.chat.completions.create({
        model: "m",
        messages: [{ role: "user", content: "hi" }],
        stream: true,
      }),
    );
    const ids = await Promise.all(streams.map((s) => s.requestId));

    assert.equal(new Set(ids).size, 3, `expected 3 distinct ids, got ${JSON.stringify(ids)}`);
    await Promise.all(streams.map(drain));
  });

  it("reading requestId does not issue a second request", async () => {
    let calls = 0;
    const c = client(async () => {
      calls++;
      return sseResponse([chunk, "[DONE]"], "req_once");
    });

    const stream = c.chat.completions.create({
      model: "m",
      messages: [{ role: "user", content: "hi" }],
      stream: true,
    });
    await stream.requestId;
    await drain(stream);

    assert.equal(calls, 1, "requestId and iteration must share one HTTP request");
  });

  it("is available before the first chunk", async () => {
    // Headers arrive first, so the id must not require consuming the body.
    const c = client(async () => sseResponse([chunk, "[DONE]"], "req_early"));
    const stream = c.chat.completions.create({
      model: "m",
      messages: [{ role: "user", content: "hi" }],
      stream: true,
    });

    const iterator = stream[Symbol.asyncIterator]();
    assert.equal(await stream.requestId, "req_early");
    await iterator.next();
  });

  it("resolves undefined rather than rejecting when the request fails", async () => {
    // A caller who only wanted the id must not get an unhandled rejection; the
    // failure still surfaces through iteration.
    const c = client(async () => new Response("nope", { status: 500 }));
    const stream = c.chat.completions.create({
      model: "m",
      messages: [{ role: "user", content: "hi" }],
      stream: true,
    });

    assert.equal(await stream.requestId, undefined);
    await assert.rejects(() => drain(stream), MeshAPIApiError);
  });

  it("resolves undefined when the response carries no header", async () => {
    const c = client(async () => sseResponse([chunk, "[DONE]"]));
    const stream = c.chat.completions.create({
      model: "m",
      messages: [{ role: "user", content: "hi" }],
      stream: true,
    });

    assert.equal(await stream.requestId, undefined);
    await drain(stream);
  });

  it("is exposed on every streaming surface", async () => {
    const c = client(async () => sseResponse(["[DONE]"], "req_surface"));

    const streams = [
      c.chat.completions.create({ model: "m", messages: [], stream: true }),
      c.responses.create({ model: "m", input: "x", stream: true }),
      c.images.stream({ model: "m", prompt: "x" }),
      c.compare.create({ models: ["a", "b"], messages: [], stream: true }),
    ];

    for (const s of streams) {
      assert.equal(await s.requestId, "req_surface");
      await drain(s);
    }
  });
});

describe("SSEStream.cancel — releasing an unconsumed stream", () => {
  /**
   * A response whose body reports whether it was cancelled. `requestId` opens
   * the response but a generator is lazy, so nothing reads the body until
   * iteration — an abandoned stream would otherwise hold the socket open.
   */
  function trackedSSEResponse(): { response: Response; cancelled: () => boolean } {
    let wasCancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`));
        // Deliberately left open: mimics a provider still generating.
      },
      cancel() {
        wasCancelled = true;
      },
    });
    return {
      response: new Response(stream, {
        status: 200,
        headers: { "content-type": "text/event-stream", "x-request-id": "req_cancel" },
      }),
      cancelled: () => wasCancelled,
    };
  }

  it("cancels the body when a stream is started but never iterated", async () => {
    const tracked = trackedSSEResponse();
    const c = client(async () => tracked.response);
    const stream = c.chat.completions.create({ model: "m", messages: [], stream: true });

    assert.equal(await stream.requestId, "req_cancel");
    assert.equal(tracked.cancelled(), false, "body should still be open before cancel()");

    await stream.cancel();
    assert.equal(tracked.cancelled(), true, "cancel() must release the connection");
  });

  it("is idempotent and never throws", async () => {
    const tracked = trackedSSEResponse();
    const c = client(async () => tracked.response);
    const stream = c.chat.completions.create({ model: "m", messages: [], stream: true });

    await stream.requestId;
    await stream.cancel();
    await stream.cancel();
    await stream.cancel();
    assert.equal(tracked.cancelled(), true);
  });

  it("is a no-op when the stream was never started", async () => {
    let calls = 0;
    const c = client(async () => {
      calls++;
      return sseResponse([chunk, "[DONE]"], "req_x");
    });
    const stream = c.chat.completions.create({ model: "m", messages: [], stream: true });

    await stream.cancel();
    assert.equal(calls, 0, "cancel() must not issue a request of its own");
  });

  it("breaking out of a for-await releases the body", async () => {
    // Pre-existing hole: releaseLock() detaches the reader without closing the
    // response, so an early `break` left the socket open.
    const tracked = trackedSSEResponse();
    const c = client(async () => tracked.response);
    const stream = c.chat.completions.create({ model: "m", messages: [], stream: true });

    for await (const _ of stream) break;

    assert.equal(tracked.cancelled(), true, "break must release the connection");
  });

  it("exposes Symbol.asyncDispose where the runtime supports it", async () => {
    const asyncDispose = (Symbol as { asyncDispose?: symbol }).asyncDispose;
    if (typeof asyncDispose !== "symbol") return; // older runtime — nothing to assert

    const tracked = trackedSSEResponse();
    const c = client(async () => tracked.response);
    const stream = c.chat.completions.create({ model: "m", messages: [], stream: true });

    await stream.requestId;
    await (stream as unknown as Record<symbol, () => Promise<void>>)[asyncDispose]();
    assert.equal(tracked.cancelled(), true);
  });
});

describe("mid-stream error frames carry a request id", () => {
  const errorFrame = { error: { code: "upstream_error", message: "boom" } };

  it("falls back to the x-request-id header when the frame omits it", async () => {
    // The exact 1.0.4 report: upstream_error with requestId "".
    const c = client(async () => sseResponse([chunk, errorFrame], "req_hdr"));
    const stream = c.chat.completions.create({
      model: "m",
      messages: [{ role: "user", content: "hi" }],
      stream: true,
    });

    await assert.rejects(
      () => drain(stream),
      (err: unknown) => {
        assert.ok(err instanceof MeshAPIApiError);
        assert.equal(err.errorCode, "upstream_error");
        assert.equal(err.requestId, "req_hdr");
        return true;
      },
    );
  });

  it("prefers the frame's own request_id over the header", async () => {
    // Post-fix gateways send it in the body; that is the authoritative value.
    const c = client(async () =>
      sseResponse([{ ...errorFrame, request_id: "req_body" }], "req_hdr"),
    );
    const stream = c.chat.completions.create({
      model: "m",
      messages: [{ role: "user", content: "hi" }],
      stream: true,
    });

    await assert.rejects(drain(stream), (err: unknown) => {
      assert.ok(err instanceof MeshAPIApiError);
      assert.equal(err.requestId, "req_body");
      return true;
    });
  });

  it("falls back when the frame carries an empty request_id", async () => {
    const c = client(async () => sseResponse([{ ...errorFrame, request_id: "" }], "req_hdr"));
    const stream = c.chat.completions.create({
      model: "m",
      messages: [{ role: "user", content: "hi" }],
      stream: true,
    });

    await assert.rejects(drain(stream), (err: unknown) => {
      assert.ok(err instanceof MeshAPIApiError);
      assert.equal(err.requestId, "req_hdr");
      return true;
    });
  });

  it("still yields an empty id when neither source has one", async () => {
    const c = client(async () => sseResponse([errorFrame]));
    const stream = c.chat.completions.create({
      model: "m",
      messages: [{ role: "user", content: "hi" }],
      stream: true,
    });

    await assert.rejects(drain(stream), (err: unknown) => {
      assert.ok(err instanceof MeshAPIApiError);
      assert.equal(err.requestId, "");
      return true;
    });
  });

  it("the stream's requestId survives a mid-stream failure", async () => {
    // Correlation must outlive the error — this is what a caller logs in catch.
    const c = client(async () => sseResponse([errorFrame], "req_after_fail"));
    const stream = c.chat.completions.create({
      model: "m",
      messages: [{ role: "user", content: "hi" }],
      stream: true,
    });

    await assert.rejects(drain(stream), MeshAPIApiError);
    assert.equal(await stream.requestId, "req_after_fail");
  });
});

describe("non-streaming errors fall back to the header", () => {
  it("uses x-request-id when the envelope omits request_id", async () => {
    const c = client(
      async () =>
        new Response(JSON.stringify({ error: { code: "internal_error", message: "x" } }), {
          status: 500,
          headers: { "content-type": "application/json", "x-request-id": "req_envelope" },
        }),
    );

    await assert.rejects(() => c.models.list(), (err: unknown) => {
      assert.ok(err instanceof MeshAPIApiError);
      assert.equal(err.requestId, "req_envelope");
      return true;
    });
  });
});
