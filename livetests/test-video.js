import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MeshAPI } from "meshapi-node-sdk";
import { BASE_URL, TOKEN } from "./config.js";

const client = new MeshAPI({ baseUrl: BASE_URL, token: TOKEN });

const VIDEO_MODEL = process.env.MESHAPI_VIDEO_GEN_MODEL ?? "byteplus/dreamina-seedance-2-0";

describe("audio (video generations)", () => {
  it("list returns paginated response", async () => {
    const listing = await client.videos.list({ limit: 5 });
    assert.ok(Array.isArray(listing.data), "expected data array");
    assert.ok(typeof listing.total === "number", "expected total");
  });

  it("generate submits task and retrieve returns matching id", async () => {
    const resp = await client.videos.generate({
      model: VIDEO_MODEL,
      content: [{ type: "text", text: "A serene mountain lake at sunrise" }],
    });
    assert.ok(resp.id, "expected task id");

    const task = await client.videos.retrieve(resp.id);
    assert.equal(task.id, resp.id, "task id mismatch");
    assert.ok(task.status, "expected status");
  });
});
