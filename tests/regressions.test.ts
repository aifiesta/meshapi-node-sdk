/**
 * Regression tests for defects found after the 0.1.1 release.
 *
 * Each test fails against the shipped behaviour and passes against the fix.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { MeshAPI, MeshAPIApiError } from "../src/index.js";
import type { CompareParams } from "../src/index.js";

const BASE = "https://api.meshapi.test";
const TOKEN = "rsk_test";

function sse(payloads: unknown[]): Response {
  const text = payloads
    .map((p) => `data: ${typeof p === "string" ? p : JSON.stringify(p)}\n\n`)
    .join("");
  return new Response(
    new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode(text));
        c.close();
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );
}

function makeResponse(status: number, body: string, contentType: string, headers: Record<string, string> = {}) {
  return new Response(body, { status, headers: { "content-type": contentType, ...headers } });
}

// ── Responses API streaming ───────────────────────────────────────────────────

describe("responses.create({ stream: true }) yields response.* events", () => {
  const FRAMES = [
    { type: "response.created", response: { id: "resp_1" } },
    { type: "response.output_text.delta", delta: "Hel" },
    { type: "response.output_text.delta", delta: "lo" },
    { type: "response.completed", response: { id: "resp_1" } },
    "[DONE]",
  ];

  it("emits every frame instead of silently dropping them", async () => {
    const client = new MeshAPI({ baseUrl: BASE, token: TOKEN, fetch: async () => sse(FRAMES) });

    const events = [];
    for await (const ev of client.responses.create({ model: "openai/o4-mini", input: "hi", stream: true })) {
      events.push(ev);
    }

    // The shared SSE parser skips `response.*` frames for the chat path; the
    // Responses API emits nothing else, so this used to yield zero events.
    assert.equal(events.length, 4);
    assert.equal(events[0].type, "response.created");
    const text = events
      .filter((e) => e.type === "response.output_text.delta")
      .map((e) => String(e["delta"] ?? ""))
      .join("");
    assert.equal(text, "Hello");
  });

  it("still hides response.* frames from the chat path", async () => {
    const client = new MeshAPI({ baseUrl: BASE, token: TOKEN, fetch: async () => sse(FRAMES) });

    const chunks = [];
    for await (const c of client.chat.completions.create({ model: "m", messages: [], stream: true })) {
      chunks.push(c);
    }
    assert.equal(chunks.length, 0, "chat callers must not receive Responses lifecycle events");
  });
});

// ── Retry-After header ────────────────────────────────────────────────────────

describe("MeshAPIApiError.retryAfterSeconds reads the Retry-After header", () => {
  it("uses the header when the body omits retry_after_seconds", async () => {
    const err = await MeshAPIApiError.fromResponse(
      makeResponse(
        429,
        JSON.stringify({ error: { code: "rate_limit_exceeded", message: "slow down" }, request_id: "req_1" }),
        "application/json",
        { "retry-after": "42" },
      ),
    );
    assert.equal(err.retryAfterSeconds, 42);
  });

  it("prefers the body value when both are present", async () => {
    const err = await MeshAPIApiError.fromResponse(
      makeResponse(
        429,
        JSON.stringify({
          error: { code: "rate_limit_exceeded", message: "slow down", retry_after_seconds: 7 },
          request_id: "req_1",
        }),
        "application/json",
        { "retry-after": "42" },
      ),
    );
    assert.equal(err.retryAfterSeconds, 7);
  });

  it("accepts an HTTP-date Retry-After", async () => {
    const at = new Date(Date.now() + 30_000).toUTCString();
    const err = await MeshAPIApiError.fromResponse(
      makeResponse(
        503,
        JSON.stringify({ error: { code: "upstream_error", message: "down" }, request_id: "req_1" }),
        "application/json",
        { "retry-after": at },
      ),
    );
    assert.ok(
      err.retryAfterSeconds !== undefined && err.retryAfterSeconds >= 28 && err.retryAfterSeconds <= 31,
      `expected ~30s, got ${err.retryAfterSeconds}`,
    );
  });

  it("stays undefined when neither is present", async () => {
    const err = await MeshAPIApiError.fromResponse(
      makeResponse(
        400,
        JSON.stringify({ error: { code: "bad_request", message: "nope" }, request_id: "req_1" }),
        "application/json",
      ),
    );
    assert.equal(err.retryAfterSeconds, undefined);
  });
});

// ── Non-JSON 4xx error codes ──────────────────────────────────────────────────

describe("non-JSON error bodies map 4xx to a meaningful code", () => {
  it("404 with a non-JSON body reports not_found, not parse_error", async () => {
    const err = await MeshAPIApiError.fromResponse(makeResponse(404, "Not Found", "text/plain"));
    assert.equal(err.errorCode, "not_found");
    assert.equal(err.status, 404);
  });

  it("401 reports unauthorized", async () => {
    const err = await MeshAPIApiError.fromResponse(makeResponse(401, "nope", "text/plain"));
    assert.equal(err.errorCode, "unauthorized");
  });

  it("5xx still reports parse_error", async () => {
    const err = await MeshAPIApiError.fromResponse(makeResponse(502, "<html>Bad Gateway</html>", "text/html"));
    assert.equal(err.errorCode, "parse_error");
  });
});

// ── Compare typing ────────────────────────────────────────────────────────────

describe("compare.create accepts a plain CompareParams", () => {
  it("compiles and runs with a runtime-built params object", async () => {
    const client = new MeshAPI({
      baseUrl: BASE,
      token: TOKEN,
      fetch: async () => new Response(JSON.stringify({ comparison_id: "cmp_1", object: "comparison" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    });

    // `stream` is a boolean, not a literal — this matched neither overload
    // before the fallback overload was added.
    const params: CompareParams = {
      models: ["a", "b"],
      messages: [{ role: "user", content: "hi" }],
      stream: false,
    };

    const result = await (client.compare.create(params) as Promise<{ comparison_id: string }>);
    assert.equal(result.comparison_id, "cmp_1");
  });
});

// ── Non-envelope JSON error bodies ────────────────────────────────────────────

describe("JSON error bodies that are not the Mesh envelope keep their message", () => {
  it("surfaces FastAPI's string detail instead of a bare HTTP status", async () => {
    const err = await MeshAPIApiError.fromResponse(
      makeResponse(
        422,
        JSON.stringify({ detail: "Model 'stabilityai/sdxl-turbo' does not support operation 'edit'." }),
        "application/json",
      ),
    );
    // Previously the body was consumed by .json(), the envelope check failed,
    // response.text() then threw, and the message collapsed to "HTTP 422".
    assert.match(err.message, /does not support operation 'edit'/);
    assert.equal(err.errorCode, "validation_error");
    assert.equal(err.status, 422);
  });

  it("flattens FastAPI's validation detail array and keeps it on .details", async () => {
    const err = await MeshAPIApiError.fromResponse(
      makeResponse(
        422,
        JSON.stringify({ detail: [{ loc: ["body", "model"], msg: "field required", type: "missing" }] }),
        "application/json",
      ),
    );
    assert.match(err.message, /body\.model: field required/);
    assert.equal(err.details.length, 1);
  });

  it("falls back to a plain `message` field", async () => {
    const err = await MeshAPIApiError.fromResponse(
      makeResponse(400, JSON.stringify({ message: "something specific went wrong" }), "application/json"),
    );
    assert.match(err.message, /something specific went wrong/);
  });

  it("keeps the request id from the header", async () => {
    const err = await MeshAPIApiError.fromResponse(
      makeResponse(422, JSON.stringify({ detail: "nope" }), "application/json", { "x-request-id": "req_detail" }),
    );
    assert.equal(err.requestId, "req_detail");
  });
});
