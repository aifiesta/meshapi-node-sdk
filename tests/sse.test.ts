/**
 * Unit tests for the SSE stream parser.
 * Tests frame parsing, [DONE] sentinel, mid-stream errors, and multi-chunk streams.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseJSONSSEStream } from "../src/http.js";
import type { ChatCompletionChunk } from "../src/index.js";

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

// ── Single chunk ──────────────────────────────────────────────────────────────

describe("parseJSONSSEStream — single chunk", () => {
  it("yields one chunk and stops at [DONE]", async () => {
    const body = chunkFrame("Hello") + "data: [DONE]\n\n";
    const chunks = await collect(
      parseJSONSSEStream<ChatCompletionChunk>(makeSSEResponse(body)),
    );
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].choices[0].delta?.content, "Hello");
  });

  it("chunk has id and model fields", async () => {
    const body = chunkFrame("Hi") + "data: [DONE]\n\n";
    const [chunk] = await collect(
      parseJSONSSEStream<ChatCompletionChunk>(makeSSEResponse(body)),
    );
    assert.ok(chunk.id);
    assert.ok(chunk.model);
  });
});

// ── Multiple chunks ───────────────────────────────────────────────────────────

describe("parseJSONSSEStream — multiple chunks", () => {
  it("yields all chunks before [DONE]", async () => {
    const body = chunkFrame("A") + chunkFrame("B") + chunkFrame("C") + "data: [DONE]\n\n";
    const chunks = await collect(
      parseJSONSSEStream<ChatCompletionChunk>(makeSSEResponse(body)),
    );
    assert.equal(chunks.length, 3);
    const contents = chunks.map(c => c.choices[0].delta?.content);
    assert.deepEqual(contents, ["A", "B", "C"]);
  });

  it("stops at [DONE] and does not yield frames after it", async () => {
    const body =
      chunkFrame("First") +
      "data: [DONE]\n\n" +
      chunkFrame("NEVER");
    const chunks = await collect(
      parseJSONSSEStream<ChatCompletionChunk>(makeSSEResponse(body)),
    );
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].choices[0].delta?.content, "First");
  });
});

// ── Mid-stream error ──────────────────────────────────────────────────────────

describe("parseJSONSSEStream — mid-stream error", () => {
  it("throws MeshAPIApiError with correct code", async () => {
    const errorFrame =
      `data: ${JSON.stringify({ error: { code: "upstream_error", message: "Server died" } })}\n\n`;
    const body = chunkFrame("Part1") + errorFrame;

    const iter = parseJSONSSEStream<ChatCompletionChunk>(makeSSEResponse(body));
    const first = (await iter[Symbol.asyncIterator]().next()).value as ChatCompletionChunk;
    assert.equal(first.choices[0].delta?.content, "Part1");

    await assert.rejects(
      async () => collect(parseJSONSSEStream<ChatCompletionChunk>(makeSSEResponse(body))),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok((err as Record<string, unknown>).errorCode === "upstream_error");
        return true;
      },
    );
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe("parseJSONSSEStream — edge cases", () => {
  it("handles empty stream gracefully", async () => {
    const chunks = await collect(
      parseJSONSSEStream<ChatCompletionChunk>(makeSSEResponse("")),
    );
    assert.equal(chunks.length, 0);
  });

  it("skips frames with no data lines", async () => {
    const body = ": comment line\n\n" + chunkFrame("X") + "data: [DONE]\n\n";
    const chunks = await collect(
      parseJSONSSEStream<ChatCompletionChunk>(makeSSEResponse(body)),
    );
    assert.equal(chunks.length, 1);
  });

  it("skips malformed JSON frames silently", async () => {
    const body = "data: {not json}\n\n" + chunkFrame("Y") + "data: [DONE]\n\n";
    const chunks = await collect(
      parseJSONSSEStream<ChatCompletionChunk>(makeSSEResponse(body)),
    );
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].choices[0].delta?.content, "Y");
  });
});
