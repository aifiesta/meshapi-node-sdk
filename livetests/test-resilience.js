import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MeshAPI } from "meshapi-node-sdk";
import { BASE_URL, TOKEN, MODEL, SECOND_MODEL } from "./config.js";

describe("resilience (retry / fallback / observability)", () => {
  it("successful call with a logger attached — no spurious events, gateway-routing only from headers", async () => {
    const events = [];
    const client = new MeshAPI({
      baseUrl: BASE_URL,
      token: TOKEN,
      logger: (e) => events.push(e),
    });

    const res = await client.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: "Reply with the word: ok" }],
      max_tokens: 10,
    });

    assert.ok(res.choices[0]?.message);
    // No client-side retry/fallback should have happened on a healthy call.
    assert.equal(events.filter((e) => e.type === "retry").length, 0);
    assert.equal(events.filter((e) => e.type === "fallback").length, 0);
    // gateway-routing appears IFF the key has an active routing_policy; when it
    // does, the shape must be sane.
    for (const e of events.filter((e) => e.type === "gateway-routing")) {
      assert.ok(e.attempts >= 1);
      assert.equal(typeof e.fallback, "boolean");
    }
  });

  it("per-call fallbackModels is client-side only — the server still serves the primary", async () => {
    const client = new MeshAPI({ baseUrl: BASE_URL, token: TOKEN });
    const res = await client.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: "Reply with the word: ok" }],
      max_tokens: 10,
      fallbackModels: [SECOND_MODEL],
    });
    // The request validated server-side (fallbackModels was stripped) and the
    // primary model answered.
    assert.ok(res.model, "expected a model on the response");
    assert.ok(res.choices[0]?.message);
  });

  it("unreachable gateway: retry events fire, the chain advances, and the last error propagates", async () => {
    const events = [];
    const client = new MeshAPI({
      // A privileged, never-bound localhost port — connect fails instantly with
      // ECONNREFUSED (a network error, NOT a timeout), which is what we want to
      // exercise: retryable + fallback-eligible. TEST-NET-1 (192.0.2.x) is unroutable
      // but on networks that silently drop its packets the connect would instead time
      // out, and timeouts are deliberately never retried — making this test flaky.
      baseUrl: "http://127.0.0.1:1",
      token: TOKEN,
      timeoutMs: 2_000,
      retry: { maxRetries: 1, backoffBaseMs: 10, backoffMaxMs: 20, retryOnNetworkError: true },
      fallback: { models: [SECOND_MODEL] },
      logger: (e) => events.push(e),
    });

    await assert.rejects(() =>
      client.chat.completions.create({
        model: MODEL,
        messages: [{ role: "user", content: "hello" }],
      }),
    );

    // Each model attempt retried once on the network error…
    assert.ok(
      events.filter((e) => e.type === "retry" && e.reason === "network-error").length >= 1,
      `expected network-error retry events, got: ${JSON.stringify(events)}`,
    );
    // …and the chain advanced to the fallback model before giving up.
    const fb = events.find((e) => e.type === "fallback");
    assert.ok(fb, "expected a fallback event");
    assert.equal(fb.fromModel, MODEL);
    assert.equal(fb.toModel, SECOND_MODEL);
  });
});
