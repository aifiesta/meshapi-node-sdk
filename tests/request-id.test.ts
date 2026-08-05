/**
 * Unit tests for request-id support:
 * - `opts.requestId` is sent as the `X-Request-Id` request header on JSON,
 *   streaming, multipart, and rawFetch paths.
 * - Invalid `requestId` values throw a TypeError before any network call
 *   (the server would silently ignore a non-conforming header).
 * - `_request_id` is attached to successful JSON responses from the
 *   `x-request-id` response header, as a non-enumerable property.
 * - Error-path `err.requestId` behaviour is unchanged.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MeshAPI, MeshAPIApiError } from "../src/index.js";

// ── Test helpers ──────────────────────────────────────────────────────────────

interface RecordedCall {
  url: string;
  init: RequestInit | undefined;
}

function makeMockFetch(responseFactory: () => Response): {
  calls: RecordedCall[];
  fetchImpl: typeof fetch;
} {
  const calls: RecordedCall[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return responseFactory();
  }) as typeof fetch;
  return { calls, fetchImpl };
}

function jsonResponse(body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...headers },
  });
}

function chatCompletionBody(): Record<string, unknown> {
  return {
    id: "chatcmpl-1",
    object: "chat.completion",
    created: 1,
    model: "openai/gpt-4o-mini",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: "4" },
        finish_reason: "stop",
        logprobs: null,
      },
    ],
    usage: null,
    system_fingerprint: null,
  };
}

function makeClient(fetchImpl: typeof fetch): MeshAPI {
  return new MeshAPI({ baseUrl: "http://localhost:9999", token: "rsk_test", fetch: fetchImpl });
}

function sentHeader(call: RecordedCall, name: string): string | null {
  return new Headers(call.init?.headers).get(name);
}

// ── Sending X-Request-Id ──────────────────────────────────────────────────────

describe("requestId option — header is sent", () => {
  it("JSON POST (chat.completions.create) sends X-Request-Id", async () => {
    const { calls, fetchImpl } = makeMockFetch(() => jsonResponse(chatCompletionBody()));
    const client = makeClient(fetchImpl);
    await client.chat.completions.create(
      { model: "m", messages: [{ role: "user", content: "hi" }] },
      { requestId: "my-trace.id:001" },
    );
    assert.equal(calls.length, 1);
    assert.equal(sentHeader(calls[0], "x-request-id"), "my-trace.id:001");
  });

  it("JSON GET (models.list) sends X-Request-Id", async () => {
    const { calls, fetchImpl } = makeMockFetch(() => jsonResponse([]));
    const client = makeClient(fetchImpl);
    await client.models.list(undefined, { requestId: "list-models-1" });
    assert.equal(sentHeader(calls[0], "x-request-id"), "list-models-1");
  });

  it("header is absent when requestId is not set", async () => {
    const { calls, fetchImpl } = makeMockFetch(() => jsonResponse(chatCompletionBody()));
    const client = makeClient(fetchImpl);
    await client.chat.completions.create({
      model: "m",
      messages: [{ role: "user", content: "hi" }],
    });
    assert.equal(sentHeader(calls[0], "x-request-id"), null);
  });

  it("streaming (SSE) request sends X-Request-Id", async () => {
    const sse = 'data: {"id":"c1","object":"chat.completion.chunk","created":1,"model":"m","choices":[]}\n\ndata: [DONE]\n\n';
    const { calls, fetchImpl } = makeMockFetch(
      () => new Response(sse, { status: 200, headers: { "content-type": "text/event-stream" } }),
    );
    const client = makeClient(fetchImpl);
    const stream = client.chat.completions.create(
      { model: "m", messages: [{ role: "user", content: "hi" }], stream: true },
      { requestId: "stream-req-1" },
    );
    for await (const _chunk of stream) {
      // drain
    }
    assert.equal(calls.length, 1);
    assert.equal(sentHeader(calls[0], "x-request-id"), "stream-req-1");
  });

  it("multipart (audio.transcribe) sends X-Request-Id", async () => {
    const { calls, fetchImpl } = makeMockFetch(() => jsonResponse({ text: "hello" }));
    const client = makeClient(fetchImpl);
    await client.audio.transcribe(new Uint8Array([1, 2, 3]), { model: "scribe_v1" }, {
      requestId: "transcribe-1",
    });
    assert.equal(sentHeader(calls[0], "x-request-id"), "transcribe-1");
  });
});

// ── Validation ────────────────────────────────────────────────────────────────

describe("requestId option — validation", () => {
  const invalidValues = [
    "",
    "has spaces",
    "bang!",
    "sla/sh",
    "a".repeat(65),
    "emoji-\u{1F600}",
  ];

  for (const bad of invalidValues) {
    it(`rejects ${JSON.stringify(bad.slice(0, 20))} with TypeError before any network call`, async () => {
      const { calls, fetchImpl } = makeMockFetch(() => jsonResponse(chatCompletionBody()));
      const client = makeClient(fetchImpl);
      await assert.rejects(
        client.chat.completions.create(
          { model: "m", messages: [{ role: "user", content: "hi" }] },
          { requestId: bad },
        ),
        TypeError,
      );
      assert.equal(calls.length, 0, "fetch must not be called for an invalid requestId");
    });
  }

  it("accepts all allowed characters and max length", async () => {
    const { calls, fetchImpl } = makeMockFetch(() => jsonResponse(chatCompletionBody()));
    const client = makeClient(fetchImpl);
    const maxLenId = "aA0._:-".padEnd(64, "x");
    await client.chat.completions.create(
      { model: "m", messages: [{ role: "user", content: "hi" }] },
      { requestId: maxLenId },
    );
    assert.equal(sentHeader(calls[0], "x-request-id"), maxLenId);
  });
});

// ── Reading _request_id from successful responses ─────────────────────────────

describe("_request_id on successful JSON responses", () => {
  it("is populated from the x-request-id response header", async () => {
    const { fetchImpl } = makeMockFetch(() =>
      jsonResponse(chatCompletionBody(), { "x-request-id": "req_01ABCDEF" }),
    );
    const client = makeClient(fetchImpl);
    const resp = await client.chat.completions.create({
      model: "m",
      messages: [{ role: "user", content: "hi" }],
    });
    assert.equal(resp._request_id, "req_01ABCDEF");
  });

  it("is non-enumerable: absent from JSON.stringify and Object.keys", async () => {
    const { fetchImpl } = makeMockFetch(() =>
      jsonResponse(chatCompletionBody(), { "x-request-id": "req_hidden" }),
    );
    const client = makeClient(fetchImpl);
    const resp = await client.chat.completions.create({
      model: "m",
      messages: [{ role: "user", content: "hi" }],
    });
    assert.ok(!JSON.stringify(resp).includes("_request_id"));
    assert.ok(!Object.keys(resp).includes("_request_id"));
    const descriptor = Object.getOwnPropertyDescriptor(resp, "_request_id");
    assert.ok(descriptor, "expected own property _request_id");
    assert.equal(descriptor.enumerable, false);
    assert.equal(descriptor.writable, false);
  });

  it("is undefined when the server sends no x-request-id header", async () => {
    const { fetchImpl } = makeMockFetch(() => jsonResponse(chatCompletionBody()));
    const client = makeClient(fetchImpl);
    const resp = await client.chat.completions.create({
      model: "m",
      messages: [{ role: "user", content: "hi" }],
    });
    assert.equal(resp._request_id, undefined);
    // Still defined as an own property so reads never hit the prototype chain
    assert.ok(Object.getOwnPropertyDescriptor(resp, "_request_id"));
  });

  it("is not attached to array bodies (models.list)", async () => {
    const { fetchImpl } = makeMockFetch(() =>
      jsonResponse([], { "x-request-id": "req_array" }),
    );
    const client = makeClient(fetchImpl);
    const models = await client.models.list();
    assert.equal(Object.getOwnPropertyDescriptor(models, "_request_id"), undefined);
  });

  it("is populated on multipart JSON responses (audio.transcribe)", async () => {
    const { fetchImpl } = makeMockFetch(() =>
      jsonResponse({ text: "hello" }, { "x-request-id": "req_multipart" }),
    );
    const client = makeClient(fetchImpl);
    const resp = await client.audio.transcribe(new Uint8Array([1]), { model: "scribe_v1" });
    assert.equal(resp._request_id, "req_multipart");
  });
});

// ── Error path is unchanged ───────────────────────────────────────────────────

describe("error responses still expose err.requestId", () => {
  it("MeshAPIApiError.requestId comes from the error envelope", async () => {
    const errorBody = JSON.stringify({
      error: { code: "unauthorized", message: "Invalid or missing API key." },
      request_id: "req_err_001",
    });
    const { fetchImpl } = makeMockFetch(
      () =>
        new Response(errorBody, {
          status: 401,
          headers: { "content-type": "application/json", "x-request-id": "req_err_001" },
        }),
    );
    const client = makeClient(fetchImpl);
    await assert.rejects(
      client.chat.completions.create({ model: "m", messages: [{ role: "user", content: "hi" }] }),
      (err: unknown) => {
        assert.ok(err instanceof MeshAPIApiError);
        assert.equal(err.status, 401);
        assert.equal(err.requestId, "req_err_001");
        return true;
      },
    );
  });
});
