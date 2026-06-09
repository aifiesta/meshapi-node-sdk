import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MeshAPI } from "meshapi-node-sdk";
import { BASE_URL, TOKEN } from "./config.js";

const client = new MeshAPI({ baseUrl: BASE_URL, token: TOKEN });

const TTS_MODEL = process.env.MESHAPI_TTS_MODEL ?? "sarvam/bulbul:v2";
const STT_MODEL = process.env.MESHAPI_STT_MODEL ?? "sarvam/saaras:v3";

describe("audio", () => {
  it("synthesize returns non-empty audio bytes", async () => {
    const audio = await client.audio.synthesize({
      input: "Hello from MeshAPI audio test.",
      model: TTS_MODEL,
    });
    assert.ok(audio instanceof Uint8Array, "expected Uint8Array");
    assert.ok(audio.length > 0, "expected non-empty audio bytes");
  });

  it("listVoices returns a response", async () => {
    const voices = await client.audio.listVoices({ page_size: 5 });
    assert.ok(voices != null, "expected non-null response");
  });
});
