import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MeshAPI } from "meshapi-node-sdk";
import { BASE_URL, TOKEN, env } from "./config.js";

const client = new MeshAPI({ baseUrl: BASE_URL, token: TOKEN });

describe("videos", () => {
  it("create and poll until terminal status", async () => {
    const videoModel = env("MESHAPI_VIDEO_GEN_MODEL");
    if (!videoModel) {
      console.log("Skipping video test: MESHAPI_VIDEO_GEN_MODEL not set");
      return;
    }

    // Create task
    const task = await client.videos.create({
      model: videoModel,
      content: [{ type: "text", text: "A calm ocean wave at sunset." }],
      duration: 4,
      resolution: "480p",
      ratio: "16:9",
    });
    assert.ok(task.id, "expected task id");

    // Poll up to 3 minutes
    const deadline = Date.now() + 180_000;
    let result = await client.videos.get(task.id);

    while (
      Date.now() < deadline &&
      result.status !== "succeeded" &&
      result.status !== "failed" &&
      result.status !== "expired" &&
      result.status !== "cancelled"
    ) {
      await new Promise((r) => setTimeout(r, 10_000));
      result = await client.videos.get(task.id);
    }

    assert.equal(result.status, "succeeded", `expected succeeded, got ${result.status} (error=${JSON.stringify(result.error)})`);
    assert.ok(result.content?.video_url, "expected video_url on succeeded task");

    console.log(`[PASS] videos.create + poll -> id=${task.id} video_url=${result.content?.video_url}`);
  });
});
