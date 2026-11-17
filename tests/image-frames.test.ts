import { test } from "node:test";
import assert from "node:assert/strict";
import type { ImageGenerationRequest, ImageOptions } from "../src/types";

// Contract guard for v1.0.421: `frame_count` and `frame_duration_ms` are
// optional fields on both `ImageGenerationRequest` and `ImageOptions`.
// These assignments fail `npm run typecheck` if either field is missing.

test("ImageGenerationRequest accepts frame_count and frame_duration_ms", () => {
  const frames: Pick<ImageGenerationRequest, "frame_count" | "frame_duration_ms"> = {
    frame_count: 4,
    frame_duration_ms: 100,
  };
  const body = JSON.parse(JSON.stringify(frames));
  assert.equal(body.frame_count, 4);
  assert.equal(body.frame_duration_ms, 100);
});

test("ImageOptions accepts frame_count and frame_duration_ms", () => {
  const frames: Pick<ImageOptions, "frame_count" | "frame_duration_ms"> = {
    frame_count: 16,
    frame_duration_ms: 20,
  };
  const body = JSON.parse(JSON.stringify(frames));
  assert.equal(body.frame_count, 16);
  assert.equal(body.frame_duration_ms, 20);
});

test("frame fields are optional and omitted when unset", () => {
  const frames: Pick<ImageOptions, "frame_count" | "frame_duration_ms"> = {};
  const body = JSON.parse(JSON.stringify(frames));
  assert.equal("frame_count" in body, false);
  assert.equal("frame_duration_ms" in body, false);
});
