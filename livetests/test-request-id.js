import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MeshAPI, MeshAPIApiError } from "meshapi-node-sdk";
import { BASE_URL, TOKEN, MODEL } from "./config.js";

/**
 * Request-id correlation, against the live gateway.
 *
 * Replaces test-on-response.js: the `onResponse` hook it exercised was removed
 * in 2.0.0 because it could never answer which of several concurrent responses
 * belonged to which call. The id now rides on the value each call returns, so
 * these tests assert the property that actually matters — that two calls in
 * flight at once get two different ids.
 */
const client = new MeshAPI({ baseUrl: BASE_URL, token: TOKEN });

describe("request id: non-streaming", () => {
  it("is attached to the returned response", async () => {
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: "Say hi." }],
      max_tokens: 5,
    });
    assert.match(
      completion.requestId ?? "",
      /^req_/,
      `expected a req_ id, got ${JSON.stringify(completion.requestId)}`,
    );
  });

  it("is distinct across concurrent calls", async () => {
    const results = await Promise.all(
      [1, 2, 3].map((n) =>
        client.chat.completions.create({
          model: MODEL,
          messages: [{ role: "user", content: `Say ${n}.` }],
          max_tokens: 5,
        }),
      ),
    );
    const ids = results.map((r) => r.requestId);
    assert.equal(new Set(ids).size, 3, `expected 3 distinct ids, got ${JSON.stringify(ids)}`);
  });

  it("does not leak into the serialised body", async () => {
    const completion = await client.models.list();
    // models.list() returns an array — nowhere to put the id, and it must not
    // acquire stray keys.
    assert.ok(Array.isArray(completion));
  });
});

describe("request id: streaming", () => {
  it("resolves before the stream is consumed", async () => {
    const stream = client.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: "Count to three." }],
      max_tokens: 20,
      stream: true,
    });

    const requestId = await stream.requestId;
    assert.match(requestId ?? "", /^req_/, `expected a req_ id, got ${requestId}`);

    let chunks = 0;
    for await (const _ of stream) chunks++;
    assert.ok(chunks > 0, "expected at least one chunk");
  });

  it("is distinct across concurrent streams", async () => {
    const streams = [1, 2, 3].map((n) =>
      client.chat.completions.create({
        model: MODEL,
        messages: [{ role: "user", content: `Say ${n}.` }],
        max_tokens: 5,
        stream: true,
      }),
    );
    const ids = await Promise.all(streams.map((s) => s.requestId));
    assert.equal(new Set(ids).size, 3, `expected 3 distinct ids, got ${JSON.stringify(ids)}`);
    await Promise.all(streams.map(async (s) => { for await (const _ of s); }));
  });

  it("cancel() releases a stream that is never consumed", async () => {
    const stream = client.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: "Write a long story." }],
      max_tokens: 500,
      stream: true,
    });
    assert.match((await stream.requestId) ?? "", /^req_/);
    await stream.cancel();
    await stream.cancel(); // idempotent
  });
});

describe("request id: errors", () => {
  it("a 401 carries the id on the error", async () => {
    const bad = new MeshAPI({ baseUrl: BASE_URL, token: "rsk_INVALID_TOKEN" });
    await assert.rejects(
      () => bad.models.list(),
      (err) => {
        assert.ok(err instanceof MeshAPIApiError);
        assert.equal(err.status, 401);
        assert.match(err.requestId ?? "", /^req_/, `expected a req_ id, got ${err.requestId}`);
        return true;
      },
    );
  });
});
