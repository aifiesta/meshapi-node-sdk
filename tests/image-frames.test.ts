import { test } from "node:test";
import assert from "node:assert/strict";
import type { ImageGenerationRequest, ImageOptions } from "../src/types";
import "../src/types-image-frames";

test("ImageGenerationRequest accepts frame_count and frame_duration_ms", () => {
  const req = {
    prompt: "a bouncing ball",
    output_format: "gif",
    frame_count: 8,
    frame_duration_ms: 100,
  } as ImageGenerationRequest;
  const body = JSON.parse(JSON.stringify(req));
  assert.equal(body.frame_count, 8);
  assert.equal(body.frame_duration_ms, 100);
});

test("ImageOptions accepts frame_count and frame_duration_ms", () => {
  const opts = { frame_count: 2, frame_duration_ms: 20 } as ImageOptions;
  assert.equal(opts.frame_count, 2);
  assert.equal(opts.frame_duration_ms, 20);
});

test("frame fields are omitted from the body when unset", () => {
  const req = { prompt: "a still image" } as ImageGenerationRequest;
  const body = JSON.parse(JSON.stringify(req));
  assert.equal("frame_count" in body, false);
  assert.equal("frame_duration_ms" in body, false);
});
