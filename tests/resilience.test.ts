/**
 * Unit tests for resilience: configurable transport retry, the chat
 * client-side model-fallback chain, and observability events (retry /
 * fallback / gateway-routing) via logger + debug.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MeshAPI } from "../src/index.js";
import type { ResilienceEvent } from "../src/index.js";
import { formatResilienceEvent, resolveRetryPolicy } from "../src/resilience.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const OK_CHAT_BODY = JSON.stringify({
  id: "chatcmpl-1",
  object: "chat.completion",
  created: 0,
  model: "openai/gpt-4o-mini",
  choices: [
    { index: 0, message: { role: "assistant", content: "hi" }, finish_reason: "stop" },
  ],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
});

function jsonResponse(status: number, body: string, headers: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function errorResponse(status: number, code = "provider_not_available", requestId = "req_err"): Response {
  return jsonResponse(
    status,
    JSON.stringify({ error: { code, message: "boom" }, request_id: requestId }),
  );
}

/** A fetch mock fed by a queue of responses / errors; records request bodies. */
function makeFetchQueue(queue: Array<Response | Error>) {
  const calls: Array<{ url: string; body: unknown }> = [];
  const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(url),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : init?.body,
    });
    const next = queue.shift();
    if (next === undefined) throw new Error("fetch queue exhausted");
    if (next instanceof Error) throw next;
    return next;
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function makeClient(
  queue: Array<Response | Error>,
  config: Record<string, unknown> = {},
) {
  const { fetchImpl, calls } = makeFetchQueue(queue);
  const events: ResilienceEvent[] = [];
  const client = new MeshAPI({
    baseUrl: "https://gw.test",
    token: "rsk_test",
    fetch: fetchImpl,
    logger: (e) => events.push(e),
    // Zero backoff so tests don't sleep.
    retry: { maxRetries: 2, backoffBaseMs: 0, backoffMaxMs: 0, ...(config["retry"] as object) },
    ...config,
  });
  return { client, calls, events };
}

const CHAT_PARAMS = {
  model: "openai/gpt-4o-mini",
  messages: [{ role: "user" as const, content: "hello" }],
};

// ── resolveRetryPolicy ────────────────────────────────────────────────────────

describe("resolveRetryPolicy", () => {
  it("applies defaults", () => {
    const p = resolveRetryPolicy(undefined, undefined);
    assert.equal(p.maxRetries, 3);
    assert.deepEqual([...p.retryOnStatus].sort(), [429, 502, 503, 504]);
    assert.equal(p.backoffBaseMs, 500);
    assert.equal(p.backoffMaxMs, 30_000);
    assert.equal(p.respectRetryAfter, true);
    assert.equal(p.retryOnNetworkError, false);
  });

  it("retry.maxRetries wins over the deprecated top-level maxRetries", () => {
    assert.equal(resolveRetryPolicy({ maxRetries: 5 }, 1).maxRetries, 5);
    assert.equal(resolveRetryPolicy(undefined, 1).maxRetries, 1);
  });
});

// ── Transport retry ───────────────────────────────────────────────────────────

describe("transport retry", () => {
  it("retries a 503 then succeeds, emitting a retry event", async () => {
    const { client, calls, events } = makeClient([
      errorResponse(503),
      jsonResponse(200, OK_CHAT_BODY),
    ]);

    const res = await client.chat.completions.create(CHAT_PARAMS);

    assert.equal(res.choices[0]?.message.content, "hi");
    assert.equal(calls.length, 2);
    const retry = events.find((e) => e.type === "retry");
    assert.ok(retry && retry.type === "retry");
    assert.equal(retry.status, 503);
    assert.equal(retry.attempt, 1);
    assert.equal(retry.requestId, undefined); // no x-request-id header on the mock
  });

  it("honours a custom retryOnStatus set", async () => {
    // 500 is not retryable by default; opt in explicitly.
    const { client, calls } = makeClient(
      [errorResponse(500), jsonResponse(200, OK_CHAT_BODY)],
      { retry: { maxRetries: 2, backoffBaseMs: 0, backoffMaxMs: 0, retryOnStatus: [500] } },
    );

    await client.chat.completions.create(CHAT_PARAMS);
    assert.equal(calls.length, 2);
  });

  it("gives up after maxRetries and throws the API error", async () => {
    const { client, calls, events } = makeClient([
      errorResponse(503),
      errorResponse(503),
      errorResponse(503),
    ]);

    await assert.rejects(
      () => client.chat.completions.create(CHAT_PARAMS),
      (err: Error & { status?: number }) => err.status === 503,
    );
    assert.equal(calls.length, 3); // 1 initial + 2 retries
    assert.equal(events.filter((e) => e.type === "retry").length, 2);
  });

  it("does not retry network errors by default", async () => {
    const { client, calls } = makeClient([new TypeError("fetch failed")]);

    await assert.rejects(() => client.models.list(), /fetch failed/);
    assert.equal(calls.length, 1);
  });

  it("retries network errors when retryOnNetworkError is set", async () => {
    const { client, calls, events } = makeClient(
      [new TypeError("fetch failed"), jsonResponse(200, "{}")],
      {
        retry: {
          maxRetries: 2,
          backoffBaseMs: 0,
          backoffMaxMs: 0,
          retryOnNetworkError: true,
        },
      },
    );

    await client.models.list();
    assert.equal(calls.length, 2);
    const retry = events.find((e) => e.type === "retry");
    assert.ok(retry && retry.type === "retry" && retry.reason === "network-error");
  });

  it("never retries an abort", async () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    const { client, calls } = makeClient([abort], {
      retry: { maxRetries: 3, backoffBaseMs: 0, backoffMaxMs: 0, retryOnNetworkError: true },
    });

    await assert.rejects(() => client.models.list(), /aborted/);
    assert.equal(calls.length, 1);
  });
});

// ── Chat model-fallback chain ─────────────────────────────────────────────────

describe("chat fallback chain", () => {
  it("advances to the next model after retries exhaust, emitting a fallback event", async () => {
    const { client, calls, events } = makeClient(
      [
        errorResponse(503), // primary attempt 1
        errorResponse(503), // primary retry 1
        jsonResponse(200, OK_CHAT_BODY), // fallback model
      ],
      {
        retry: { maxRetries: 1, backoffBaseMs: 0, backoffMaxMs: 0 },
        fallback: { models: ["anthropic/claude-sonnet-5"] },
      },
    );

    const res = await client.chat.completions.create(CHAT_PARAMS);

    assert.equal(res.choices[0]?.message.content, "hi");
    assert.equal(calls.length, 3);
    assert.equal((calls[2]?.body as { model: string }).model, "anthropic/claude-sonnet-5");
    const fb = events.find((e) => e.type === "fallback");
    assert.ok(fb && fb.type === "fallback");
    assert.equal(fb.fromModel, "openai/gpt-4o-mini");
    assert.equal(fb.toModel, "anthropic/claude-sonnet-5");
    assert.equal(fb.status, 503);
  });

  it("per-call fallbackModels overrides the client config and is never sent to the server", async () => {
    const { client, calls } = makeClient(
      [errorResponse(502), jsonResponse(200, OK_CHAT_BODY)],
      {
        retry: { maxRetries: 0, backoffBaseMs: 0, backoffMaxMs: 0 },
        fallback: { models: ["ignored/config-model"] },
      },
    );

    await client.chat.completions.create({
      ...CHAT_PARAMS,
      fallbackModels: ["mistral/mistral-large"],
    });

    assert.equal((calls[1]?.body as { model: string }).model, "mistral/mistral-large");
    for (const call of calls) {
      assert.ok(!("fallbackModels" in (call.body as object)), "fallbackModels leaked to the wire");
    }
  });

  it("terminal errors (401) never advance the chain", async () => {
    const { client, calls } = makeClient(
      [errorResponse(401, "unauthorized")],
      {
        retry: { maxRetries: 0, backoffBaseMs: 0, backoffMaxMs: 0 },
        fallback: { models: ["anthropic/claude-sonnet-5"] },
      },
    );

    await assert.rejects(
      () => client.chat.completions.create(CHAT_PARAMS),
      (err: Error & { status?: number }) => err.status === 401,
    );
    assert.equal(calls.length, 1);
  });

  it("exhausting the whole chain throws the last error", async () => {
    const { client, calls } = makeClient(
      [errorResponse(503), errorResponse(503), errorResponse(504, "gateway_timeout", "req_last")],
      {
        retry: { maxRetries: 0, backoffBaseMs: 0, backoffMaxMs: 0 },
        fallback: { models: ["m/a", "m/b"] },
      },
    );

    await assert.rejects(
      () => client.chat.completions.create(CHAT_PARAMS),
      (err: Error & { status?: number; requestId?: string }) =>
        err.status === 504 && err.requestId === "req_last",
    );
    assert.equal(calls.length, 3);
  });

  it("skips the primary model when it also appears in the chain", async () => {
    const { client, calls } = makeClient(
      [errorResponse(503), jsonResponse(200, OK_CHAT_BODY)],
      {
        retry: { maxRetries: 0, backoffBaseMs: 0, backoffMaxMs: 0 },
        fallback: { models: ["openai/gpt-4o-mini", "m/b"] },
      },
    );

    await client.chat.completions.create(CHAT_PARAMS);
    assert.equal(calls.length, 2);
    assert.equal((calls[1]?.body as { model: string }).model, "m/b");
  });

  it("custom fallback.onStatus controls eligibility", async () => {
    // 429 not in the default fallback set — opt in.
    const { client, calls } = makeClient(
      [errorResponse(429, "rate_limit_exceeded"), jsonResponse(200, OK_CHAT_BODY)],
      {
        retry: { maxRetries: 0, backoffBaseMs: 0, backoffMaxMs: 0 },
        fallback: { models: ["m/b"], onStatus: [429] },
      },
    );

    await client.chat.completions.create(CHAT_PARAMS);
    assert.equal(calls.length, 2);
  });
});

// ── Gateway routing observability ─────────────────────────────────────────────

describe("gateway-routing events", () => {
  it("parses X-Mesh-Routing-* headers into a gateway-routing event", async () => {
    const { client, events } = makeClient([
      jsonResponse(200, OK_CHAT_BODY, {
        "x-mesh-routing-attempts": "2",
        "x-mesh-routing-fallback": "true",
        // The gateway does not send a served-provider header; assert we don't
        // surface a provider name even if some upstream header sneaks through.
        "x-mesh-served-provider": "bedrock",
        "x-request-id": "req_routed",
      }),
    ]);

    await client.chat.completions.create(CHAT_PARAMS);

    const gw = events.find((e) => e.type === "gateway-routing");
    assert.ok(gw && gw.type === "gateway-routing");
    assert.equal(gw.attempts, 2);
    assert.equal(gw.fallback, true);
    assert.equal(gw.requestId, "req_routed");
    // The provider name is never exposed on the event.
    assert.equal("servedProvider" in gw, false);
  });

  it("emits nothing when the headers are absent (no active routing policy)", async () => {
    const { client, events } = makeClient([jsonResponse(200, OK_CHAT_BODY)]);
    await client.chat.completions.create(CHAT_PARAMS);
    assert.equal(events.filter((e) => e.type === "gateway-routing").length, 0);
  });
});

// ── Debug formatting ──────────────────────────────────────────────────────────

describe("formatResilienceEvent", () => {
  it("renders a retry line", () => {
    const line = formatResilienceEvent({
      type: "retry",
      method: "POST",
      path: "/v1/chat/completions",
      attempt: 1,
      maxRetries: 3,
      status: 503,
      requestId: "req_1",
      delayMs: 512.4,
      reason: "status",
    });
    assert.equal(
      line,
      "retrying POST /v1/chat/completions (attempt 1/4 failed: 503, next in 512ms) [req_1]",
    );
  });

  it("renders a fallback line", () => {
    const line = formatResilienceEvent({
      type: "fallback",
      fromModel: "openai/gpt-4o",
      toModel: "anthropic/claude-sonnet-5",
      chainIndex: 0,
      chainLength: 2,
      status: 503,
      errorCode: "provider_not_available",
    });
    assert.equal(
      line,
      "falling back openai/gpt-4o → anthropic/claude-sonnet-5 (1/2: 503 provider_not_available)",
    );
  });

  it("renders a gateway-routing line", () => {
    const line = formatResilienceEvent({
      type: "gateway-routing",
      path: "/v1/chat/completions",
      attempts: 2,
      fallback: true,
      requestId: "req_2",
    });
    assert.equal(
      line,
      "gateway served /v1/chat/completions (2 attempts, provider fallback) [req_2]",
    );
  });
});
