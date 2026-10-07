/**
 * Tests for the per-request `timeout` field on ChatCompletionParams /
 * ResponsesParams, and for SSE gateway_timeout error frame handling.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseJSONSSEStream } from "../src/http.js";
import { MeshAPI, MeshAPIApiError } from "../src/index.js";
import type { ChatCompletionChunk, ChatCompletionParams, ResponsesParams } from "../src/index.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSSEResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function chunkFrame(content: string): string {
  const data = JSON.stringify({
    id: "x",
    object: "chat.completion.chunk",
    created: 1,
    model: "m",
    choices: [{ index: 0, delta: { content }, finish_reason: null }],
  });
  return `data: ${data}\n\n`;
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) {
    items.push(item);
  }
  return items;
}

async function collectExpectingError<T>(
  iterable: AsyncIterable<T>,
): Promise<{ items: T[]; error: unknown }> {
  const items: T[] = [];
  try {
    for await (const item of iterable) {
      items.push(item);
    }
    return { items, error: null };
  } catch (error) {
    return { items, error };
  }
}

// ── ChatCompletionParams.timeout serialisation ────────────────────────────────

describe("ChatCompletionParams.timeout", () => {
  it("timeout is serialised into the JSON body when set", () => {
    const params: ChatCompletionParams = {
      messages: [{ role: "user", content: "hi" }],
      model: "openai/gpt-4o-mini",
      timeout: 600,
    };
    // Verify the field is present in the plain object (serialised via JSON.stringify)
    const body = JSON.parse(JSON.stringify(params));
    assert.equal(body.timeout, 600);
  });

  it("timeout is absent from the body when not set", () => {
    const params: ChatCompletionParams = {
      messages: [{ role: "user", content: "hi" }],
      model: "openai/gpt-4o-mini",
    };
    const body = JSON.parse(JSON.stringify(params));
    assert.ok(!("timeout" in body), "timeout key must not appear when omitted");
  });

  it("timeout accepts large values (e.g. 1000 seconds)", () => {
    const params: ChatCompletionParams = {
      messages: [{ role: "user", content: "hi" }],
      timeout: 1000,
    };
    const body = JSON.parse(JSON.stringify(params));
    assert.equal(body.timeout, 1000);
  });
});

// ── ResponsesParams.timeout serialisation ────────────────────────────────────

describe("ResponsesParams.timeout", () => {
  it("timeout is serialised into the JSON body when set", () => {
    const params: ResponsesParams = {
      input: "hello",
      timeout: 900,
    };
    const body = JSON.parse(JSON.stringify(params));
    assert.equal(body.timeout, 900);
  });

  it("timeout is absent from the body when not set", () => {
    const params: ResponsesParams = { input: "hello" };
    const body = JSON.parse(JSON.stringify(params));
    assert.ok(!("timeout" in body), "timeout key must not appear when omitted");
  });
});

// ── SSE: gateway_timeout error frame ─────────────────────────────────────────

describe("SSE gateway_timeout error frame", () => {
  const gatewayTimeoutFrame =
    `data: ${JSON.stringify({ error: { code: "gateway_timeout", message: "Upstream provider did not respond in time." } })}\n\n`;

  it("raises MeshAPIApiError with code=gateway_timeout when the backend emits the frame", async () => {
    // This is the exact SSE frame the backend emits when the upstream provider
    // exceeds the server's 300 s default timeout.
    const body = gatewayTimeoutFrame + "data: [DONE]\n\n";
    const { items, error } = await collectExpectingError(
      parseJSONSSEStream<ChatCompletionChunk>(makeSSEResponse(body)),
    );
    assert.equal(items.length, 0, "no chunks should be emitted before the error");
    assert.ok(error != null, "expected an error to be thrown");
    const err = error as { errorCode?: string; message?: string };
    assert.equal(err.errorCode, "gateway_timeout");
  });

  it("yields partial content then raises gateway_timeout (customer scenario)", async () => {
    // The customer hit this: tokens streamed, then the backend timed out after 300 s.
    const body =
      chunkFrame("Hello ") +
      chunkFrame("world") +
      gatewayTimeoutFrame +
      "data: [DONE]\n\n";

    const { items, error } = await collectExpectingError(
      parseJSONSSEStream<ChatCompletionChunk>(makeSSEResponse(body)),
    );

    assert.equal(items.length, 2, "should receive 2 partial chunks before the error");
    assert.equal(items[0].choices[0].delta?.content, "Hello ");
    assert.equal(items[1].choices[0].delta?.content, "world");

    assert.ok(error != null, "expected a gateway_timeout error after partial content");
    const err = error as { errorCode?: string };
    assert.equal(err.errorCode, "gateway_timeout");
  });

  it("raises immediately when timeout fires before any content", async () => {
    const body = gatewayTimeoutFrame;
    const { items, error } = await collectExpectingError(
      parseJSONSSEStream<ChatCompletionChunk>(makeSSEResponse(body)),
    );
    assert.equal(items.length, 0);
    assert.ok(error != null);
    const err = error as { errorCode?: string };
    assert.equal(err.errorCode, "gateway_timeout");
  });
});

// ── Client timeoutMs on streams: TTFB only ───────────────────────────────────

// Mirrors real fetch: an abort rejects the pending call before headers, and
// errors the body after them.
function slowStreamFetch(frames: number, intervalMs: number): typeof fetch {
  return async (_url, init) => {
    const signal = init?.signal as AbortSignal;
    let timer: ReturnType<typeof setInterval> | undefined;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        let i = 0;
        timer = setInterval(() => {
          if (i < frames) {
            c.enqueue(new TextEncoder().encode(chunkFrame(`t${i++} `)));
          } else {
            clearInterval(timer);
            c.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
            c.close();
          }
        }, intervalMs);
        signal.addEventListener("abort", () => {
          clearInterval(timer);
          c.error(signal.reason);
        });
      },
      cancel() {
        clearInterval(timer);
      },
    });
    return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
  };
}

function neverRespondingFetch(): typeof fetch {
  return (_url, init) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal as AbortSignal;
      signal.addEventListener("abort", () => reject(signal.reason));
    });
}

function stalledErrorBodyFetch(): typeof fetch {
  return async (_url, init) => {
    const signal = init?.signal as AbortSignal;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode('{"error":'));
        signal.addEventListener("abort", () => c.error(signal.reason));
      },
    });
    return new Response(body, { status: 500, headers: { "content-type": "application/json" } });
  };
}

describe("client timeoutMs on streaming requests", () => {
  const params = {
    model: "m",
    messages: [{ role: "user" as const, content: "hi" }],
    stream: true as const,
  };

  it("does not abort a stream that outlives timeoutMs once headers have arrived", async () => {
    // timeoutMs bounds the wait for headers, never a stream that is still sending.
    const client = new MeshAPI({
      baseUrl: "https://api.meshapi.test",
      token: "rsk_test",
      timeoutMs: 50,
      fetch: slowStreamFetch(10, 20),
    });
    const chunks = await collect(client.chat.completions.create(params));
    assert.equal(chunks.length, 10);
  });

  it("still times out when response headers never arrive", async () => {
    const client = new MeshAPI({
      baseUrl: "https://api.meshapi.test",
      token: "rsk_test",
      timeoutMs: 50,
      fetch: neverRespondingFetch(),
    });
    const { items, error } = await collectExpectingError(client.chat.completions.create(params));
    assert.equal(items.length, 0);
    assert.equal((error as { name?: string })?.name, "TimeoutError");
  });

  it("still times out reading an error body that stalls", async () => {
    const client = new MeshAPI({
      baseUrl: "https://api.meshapi.test",
      token: "rsk_test",
      timeoutMs: 50,
      maxRetries: 0,
      fetch: stalledErrorBodyFetch(),
    });
    const started = Date.now();
    const { error } = await collectExpectingError(client.chat.completions.create(params));
    assert.ok(error instanceof MeshAPIApiError);
    assert.equal(error.status, 500);
    assert.ok(Date.now() - started < 1_000, "the error body read must stay under timeoutMs");
  });

  it("a caller signal still aborts mid-stream", async () => {
    const controller = new AbortController();
    const client = new MeshAPI({
      baseUrl: "https://api.meshapi.test",
      token: "rsk_test",
      timeoutMs: 1_000,
      fetch: slowStreamFetch(50, 10),
    });
    setTimeout(() => controller.abort(), 60);
    const { items, error } = await collectExpectingError(
      client.chat.completions.create(params, { signal: controller.signal }),
    );
    assert.ok(items.length > 0 && items.length < 50, `got ${items.length} chunks`);
    assert.ok(error != null, "expected the caller's abort to surface");
  });
});
