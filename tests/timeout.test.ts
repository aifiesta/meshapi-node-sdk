/**
 * Tests for the per-request `timeout` field on ChatCompletionParams /
 * ResponsesParams, and for SSE gateway_timeout error frame handling.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseJSONSSEStream } from "../src/http.js";
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
    const err = error as { code?: string; message?: string };
    assert.equal(err.code, "gateway_timeout");
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
    const err = error as { code?: string };
    assert.equal(err.code, "gateway_timeout");
  });

  it("raises immediately when timeout fires before any content", async () => {
    const body = gatewayTimeoutFrame;
    const { items, error } = await collectExpectingError(
      parseJSONSSEStream<ChatCompletionChunk>(makeSSEResponse(body)),
    );
    assert.equal(items.length, 0);
    assert.ok(error != null);
    const err = error as { code?: string };
    assert.equal(err.code, "gateway_timeout");
  });
});
