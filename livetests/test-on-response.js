import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MeshAPI, MeshAPIApiError } from "meshapi-node-sdk";
import { BASE_URL, TOKEN, MODEL } from "./config.js";

/**
 * The `onResponse` hook surfaces the gateway's `x-request-id` for *successful*
 * responses, which were previously the only ones with no way to recover it —
 * failures already expose it via `MeshAPIApiError.requestId`.
 *
 * These tests assert against a real gateway that the header is actually present
 * and that the hook reports the same id the error carries.
 */

/** Client that records every onResponse callback. */
function withHook(token = TOKEN) {
  const seen = [];
  const client = new MeshAPI({
    baseUrl: BASE_URL,
    token,
    maxRetries: 0,
    onResponse: (info) => seen.push(info),
  });
  return { client, seen };
}

const REQUEST_ID_RE = /^req_/;

describe("onResponse: successful responses expose x-request-id", () => {
  it("non-streaming chat completion", async () => {
    const { client, seen } = withHook();
    await client.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: "Reply with the single word OK." }],
      max_tokens: 8,
      temperature: 0,
    });

    assert.equal(seen.length, 1);
    assert.match(seen[0].requestId ?? "", REQUEST_ID_RE, "expected a req_ id on a successful chat call");
    assert.equal(seen[0].status, 200);
    assert.equal(seen[0].method, "POST");
    assert.ok(seen[0].url.endsWith("/v1/chat/completions"));
    assert.ok(seen[0].durationMs >= 0);
  });

  it("streaming chat completion (fires when headers arrive)", async () => {
    const { client, seen } = withHook();
    let chunks = 0;
    for await (const _chunk of client.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: "Count from 1 to 3." }],
      max_tokens: 24,
      temperature: 0,
      stream: true,
    })) {
      chunks++;
    }

    assert.ok(chunks > 0, "expected at least one SSE chunk");
    assert.equal(seen.length, 1);
    assert.match(seen[0].requestId ?? "", REQUEST_ID_RE, "expected a req_ id on a successful stream");
    assert.equal(seen[0].status, 200);
  });

  it("GET request (models.list)", async () => {
    const { client, seen } = withHook();
    await client.models.list();

    assert.equal(seen.length, 1);
    assert.match(seen[0].requestId ?? "", REQUEST_ID_RE);
    assert.equal(seen[0].method, "GET");
  });
});

describe("onResponse: failures", () => {
  it("fires on 401 and reports the same id as MeshAPIApiError.requestId", async () => {
    const { client, seen } = withHook("rsk_INVALID_TOKEN");

    let captured = null;
    await assert.rejects(
      () => client.models.list(),
      (err) => {
        assert.ok(err instanceof MeshAPIApiError);
        captured = err;
        return true;
      },
    );

    assert.equal(seen.length, 1);
    assert.equal(seen[0].status, 401);
    assert.equal(
      seen[0].requestId,
      captured.requestId,
      "hook must report the same request id the error carries",
    );
  });

  it("fires on an unknown model (404)", async () => {
    const { client, seen } = withHook();

    await assert.rejects(
      () => client.chat.completions.create({
        model: "nonexistent/not-a-real-model-xyz",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 4,
      }),
      (err) => err instanceof MeshAPIApiError,
    );

    assert.equal(seen.length, 1);
    assert.match(seen[0].requestId ?? "", REQUEST_ID_RE);
  });
});

describe("onResponse: safety", () => {
  it("a throwing hook does not break the request", async () => {
    const client = new MeshAPI({
      baseUrl: BASE_URL,
      token: TOKEN,
      onResponse: () => {
        throw new Error("logging blew up");
      },
    });

    const reply = await client.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: "Reply with the single word OK." }],
      max_tokens: 8,
      temperature: 0,
    });

    assert.ok(reply.choices.length > 0, "request must succeed despite a throwing hook");
  });
});
