import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MeshAPI, MeshAPIApiError } from "meshapi-node-sdk";
import { BASE_URL, TOKEN, MODEL } from "./config.js";

const client = new MeshAPI({ baseUrl: BASE_URL, token: TOKEN });

describe("chat completions (streaming)", () => {
  it("basic stream yields content chunks", async () => {
    let chunks = 0;
    let content = "";
    for await (const chunk of client.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: "Count exactly from 1 to 3." }],
      stream: true,
    })) {
      const text = chunk.choices[0]?.delta?.content ?? "";
      content += text;
      if (text) chunks++;
    }
    assert.ok(chunks > 0, "expected at least one content chunk");
    assert.ok(content.trim(), "expected non-empty accumulated content");
  });

  it("stream chunks have id and model fields", async () => {
    const iter = client.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: "Say hi." }],
      max_tokens: 10,
      stream: true,
    });
    let first = null;
    for await (const chunk of iter) {
      first = chunk;
      break;
    }
    assert.ok(first != null, "expected at least one chunk");
    assert.ok(first.id, "first chunk should have an id");
    assert.ok(first.model, "first chunk should have a model field");
  });

  it("early stop does not throw", async () => {
    let seen = 0;
    for await (const _chunk of client.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: "Count slowly from 1 to 100." }],
      stream: true,
    })) {
      seen++;
      if (seen >= 3) break;
    }
    assert.ok(seen >= 1, "expected at least one chunk before early stop");
  });

  it("invalid token throws MeshAPIApiError with 401", async () => {
    const badClient = new MeshAPI({ baseUrl: BASE_URL, token: "rsk_INVALID_TOKEN" });
    await assert.rejects(
      async () => {
        for await (const _chunk of badClient.chat.completions.create({
          model: MODEL,
          messages: [{ role: "user", content: "hello" }],
          stream: true,
        })) { /* consume */ }
      },
      (err) => {
        assert.ok(err instanceof MeshAPIApiError, `expected MeshAPIApiError, got ${err?.constructor?.name}`);
        assert.equal(err.status, 401);
        return true;
      },
    );
  });
});
