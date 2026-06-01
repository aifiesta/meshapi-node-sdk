import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MeshAPI } from "meshapi-node-sdk";
import { BASE_URL, TOKEN, MODEL, SECOND_MODEL, env } from "./config.js";

const client = new MeshAPI({ baseUrl: BASE_URL, token: TOKEN });

// Not all models support the Batch API; this one is known to have batching enabled.
const BATCH_MODEL = "openai/gpt-5-nano";

function batchRequests(tag) {
  return [
    {
      custom_id: `${tag}-1`,
      body: {
        model: BATCH_MODEL,
        messages: [{ role: "user", content: "Reply with the single word: hello" }],
        max_tokens: 10,
      },
    },
    {
      custom_id: `${tag}-2`,
      body: {
        model: BATCH_MODEL,
        messages: [{ role: "user", content: "Reply with the single word: world" }],
        max_tokens: 10,
      },
    },
  ];
}

describe("embeddings", () => {
  it("create returns embedding vectors", async () => {
    const embeddingsModel = env("MESHAPI_EMBEDDINGS_MODEL", "openai/text-embedding-3-small");
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
      max_output_tokens: 16,
    });
    assert.ok(resp.id, "expected response id");
    assert.ok(resp.status, "expected status field");
  });

  it("stream yields events", { skip: "Responses API specific events (reasoning, lifecycle) are currently filtered out by the SDK's SSE parser, so the stream may be empty depending on the model." }, async () => {
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
      models: [MODEL, SECOND_MODEL],
      messages: [{ role: "user", content: "Reply with the word: compare" }],
      skip_comparison: true,
      max_tokens: 10,
    });
    assert.equal(result.results.length, 2, "expected two compare results");
  });

  it("stream yields events", { skip: "server-side SQLAlchemy session concurrency issue when compare tests run back-to-back" }, async () => {
    let events = 0;
    for await (const _event of client.compare.create({
      models: [MODEL, SECOND_MODEL],
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

describe("batches lifecycle", () => {
  it("create → list → get → cancel", async () => {
    const tag = `node-livetest-${Date.now()}`;

    // Create batch with inline requests (no file upload step required)
    const batch = await client.batches.create({
      requests: batchRequests(tag),
      metadata: { suite: "node-livetest" },
    });
    assert.ok(batch.id, "expected batch id");

    const list = await client.batches.list({ limit: 10 });
    assert.ok(list.data.some(b => b.id === batch.id), "created batch not found in list");

    const got = await client.batches.get(batch.id);
    assert.equal(got.id, batch.id);

    const cancelled = await client.batches.cancel(batch.id);
    assert.equal(cancelled.id, batch.id);
  });
});

describe("images", () => {
  it("generate returns created timestamp and data", async () => {
    const imageGenModel = env("MESHAPI_IMAGE_GEN_MODEL");
    if (!imageGenModel) {
      console.log("Skipping images test: MESHAPI_IMAGE_GEN_MODEL not set");
      return;
    }
    const resp = await client.images.generate({
      model: imageGenModel,
      prompt: "A small blue square on a white background.",
      n: 1,
      size: "1024x1024",
    });
    assert.ok(resp.created, "expected created timestamp");
    assert.ok(Array.isArray(resp.data) && resp.data.length > 0, "expected image data");
    assert.ok(resp.data[0].b64_json || resp.data[0].url, "expected image data");
  });
});

