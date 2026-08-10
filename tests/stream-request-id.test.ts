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
