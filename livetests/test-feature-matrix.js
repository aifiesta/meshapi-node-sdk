import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MeshAPI } from "meshapi-node-sdk";
import { BASE_URL, TOKEN, MODEL, SECOND_MODEL, env } from "./config.js";

const client = new MeshAPI({ baseUrl: BASE_URL, token: TOKEN });

describe("feature matrix — stable options", () => {
  it("chat with seed, temperature, top_p, user", async () => {
    const resp = await client.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: "Reply with exactly the word: seeded" }],
      seed: 42,
      temperature: 0,
      top_p: 1,
      user: "node-feature-matrix",
      max_tokens: 10,
    });
    assert.ok(resp.id, "expected response id");
    assert.ok(resp.model, "expected model field");
  });

  it("responses with reasoning skipped — reasoning.effort not supported by default model", async (t) => {
    t.skip("reasoning.effort not supported by default model; needs a reasoning-capable model");
  });

  it("embeddings with multi-input array and user", async () => {
    const embeddingsModel = env("MESHAPI_EMBEDDINGS_MODEL", "openai/text-embedding-3-small");
    const result = await client.embeddings.create({

      model: embeddingsModel,
      input: ["alpha", "beta"],
      user: "node-feature-matrix",
    });
    assert.equal(result.data.length, 2, "expected 2 embedding items for 2 inputs");
  });

  it("compare with comparison_instructions and skip_comparison", async () => {
    const result = await client.compare.create({
      models: [MODEL, SECOND_MODEL],
      messages: [{ role: "user", content: "Reply with compare" }],
      comparison_instructions: "Do not add extra prose.",
      max_tokens: 10,
      skip_comparison: true,
    });
    assert.equal(result.results.length, 2, "expected two compare results");
  });
});

describe("feature matrix — optional multimodal", () => {
  it("image input (skipped if MESHAPI_IMAGE_URL not set)", async (t) => {
    const imageUrl = env("MESHAPI_IMAGE_URL");
    if (!imageUrl) return t.skip("set MESHAPI_IMAGE_URL to enable");
    const resp = await client.chat.completions.create({
      model: env("MESHAPI_IMAGE_MODEL", MODEL),
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "Describe this image in three words." },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      }],
      max_tokens: 30,
    });
    assert.ok(resp.id);
  });

  it("audio input (skipped if MESHAPI_INPUT_AUDIO_B64 not set)", async (t) => {
    const audioB64 = env("MESHAPI_INPUT_AUDIO_B64");
    if (!audioB64) return t.skip("set MESHAPI_INPUT_AUDIO_B64 to enable");
    const resp = await client.chat.completions.create({
      model: env("MESHAPI_AUDIO_MODEL", MODEL),
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "Transcribe this audio briefly." },
          { type: "input_audio", input_audio: { data: audioB64, format: env("MESHAPI_INPUT_AUDIO_FORMAT", "wav") } },
        ],
      }],
      max_tokens: 40,
    });
    assert.ok(resp.id);
  });

  it("audio output (skipped if MESHAPI_AUDIO_OUT_MODEL not set)", async (t) => {
    const audioOutModel = env("MESHAPI_AUDIO_OUT_MODEL");
    if (!audioOutModel) return t.skip("set MESHAPI_AUDIO_OUT_MODEL to enable");
    const resp = await client.chat.completions.create({
      model: audioOutModel,
      messages: [{ role: "user", content: "Say hello in one sentence." }],
      modalities: ["text", "audio"],
      audio: { voice: "alloy", format: "wav" },
      max_tokens: 40,
    });
    assert.ok(resp.id);
  });

  it("image generation (skipped if MESHAPI_IMAGE_GEN_MODEL not set)", async (t) => {
    const imageGenModel = env("MESHAPI_IMAGE_GEN_MODEL");
    if (!imageGenModel) return t.skip("set MESHAPI_IMAGE_GEN_MODEL to enable");
    const resp = await client.chat.completions.create({
      model: imageGenModel,
      messages: [{ role: "user", content: "Generate a simple red square icon." }],
      modality: "image",
      image: { n: 1, size: "1024x1024", quality: "high" },
      async_mode: false,
      max_tokens: 100,
    });
    assert.ok(resp.id);
  });
});
