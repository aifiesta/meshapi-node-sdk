import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MeshAPI } from "meshapi-node-sdk";
import { BASE_URL, TOKEN, MODEL, env } from "./config.js";

const client = new MeshAPI({ baseUrl: BASE_URL, token: TOKEN });

function batchRequests(tag) {
  return [
    {
      custom_id: `${tag}-1`,
      body: {
        model: MODEL,
        messages: [{ role: "user", content: "Reply with the single word: hello" }],
        max_tokens: 10,
      },
    },
    {
      custom_id: `${tag}-2`,
      body: {
        model: MODEL,
        messages: [{ role: "user", content: "Reply with the single word: world" }],
        max_tokens: 10,
      },
    },
  ];
}

describe("embeddings", () => {
  it("create returns embedding vectors", async () => {
    const embeddingsModel = env("MESHAPI_EMBEDDINGS_MODEL", MODEL);
    const result = await client.embeddings.create({
      model: embeddingsModel,
      input: "MeshAPI embeddings smoke test",
    });
    assert.ok(Array.isArray(result.data) && result.data.length > 0, "expected embedding data");
    assert.ok(result.data[0].embedding.length > 0, "expected non-empty embedding vector");
    assert.ok(result.model, "expected model field");
  });
});

describe("responses", () => {
  it("create returns response with id and status", async () => {
    const resp = await client.responses.create({
      model: MODEL,
      input: "Reply with exactly the word: ok",
      max_output_tokens: 10,
    });
    assert.ok(resp.id, "expected response id");
    assert.ok(resp.status, "expected status field");
  });

  it("stream yields events", async () => {
    let events = 0;
    for await (const _event of client.responses.create({
      model: MODEL,
      input: "Count from 1 to 3.",
      max_output_tokens: 20,
      stream: true,
    })) {
      events++;
    }
    assert.ok(events > 0, "expected at least one streaming event");
  });
});

describe("compare", () => {
  it("create returns two results", async () => {
    const result = await client.compare.create({
      models: [MODEL, MODEL],
      messages: [{ role: "user", content: "Reply with the word: compare" }],
      skip_comparison: true,
      max_tokens: 10,
    });
    assert.equal(result.results.length, 2, "expected two compare results");
  });

  it("stream yields events", async () => {
    let events = 0;
    for await (const _event of client.compare.create({
      models: [MODEL, MODEL],
      messages: [{ role: "user", content: "Reply with the word: stream" }],
      skip_comparison: true,
      max_tokens: 10,
      stream: true,
    })) {
      events++;
    }
    assert.ok(events > 0, "expected at least one compare stream event");
  });
});

describe("files and batches lifecycle", () => {
  it("upload → get → content → create batch → list → get → cancel → delete", async () => {
    const tag = `node-livetest-${Date.now()}`;
    const uploaded = await client.files.upload({ requests: batchRequests(tag) });
    assert.ok(uploaded.id, "expected file id after upload");

    try {
      const fetched = await client.files.get(uploaded.id);
      assert.equal(fetched.id, uploaded.id);

      const content = await client.files.content(uploaded.id);
      assert.ok(content instanceof Uint8Array && content.length > 0, "expected non-empty file content");
      const text = new TextDecoder().decode(content);
      assert.ok(text.includes(`${tag}-1`), "expected file content to include custom_id");

      const batch = await client.batches.create({
        input_file_id: uploaded.id,
        endpoint: "/v1/chat/completions",
        completion_window: "24h",
        metadata: { suite: "node-livetest" },
      });
      assert.ok(batch.id, "expected batch id");

      const list = await client.batches.list({ limit: 10 });
      assert.ok(list.data.some(b => b.id === batch.id), "created batch not found in list");

      const got = await client.batches.get(batch.id);
      assert.equal(got.id, batch.id);

      const cancelled = await client.batches.cancel(batch.id);
      assert.equal(cancelled.id, batch.id);
    } finally {
      await client.files.delete(uploaded.id).catch(() => {});
    }
  });
});
