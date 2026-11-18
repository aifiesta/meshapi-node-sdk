import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { ImageGenerationRequest, ImageOptions } from '../src/types';
import type { ImageFrameOptions } from '../src/image-frames';
import '../src/image-frames';

type RequestFrames = Pick<ImageGenerationRequest, 'frame_count' | 'frame_duration_ms'>;
type OptionFrames = Pick<ImageOptions, 'frame_count' | 'frame_duration_ms'>;

test('ImageGenerationRequest frame fields serialise as snake_case', () => {
  const frames: RequestFrames = { frame_count: 8, frame_duration_ms: 100 };
  const body = JSON.parse(JSON.stringify(frames));
  assert.deepEqual(body, { frame_count: 8, frame_duration_ms: 100 });
});

test('ImageOptions frame fields serialise as snake_case', () => {
  const frames: OptionFrames = { frame_count: 4, frame_duration_ms: 250 };
  const body = JSON.parse(JSON.stringify(frames));
  assert.deepEqual(body, { frame_count: 4, frame_duration_ms: 250 });
});

test('frame fields are optional and omitted when unset', () => {
  const frames: ImageFrameOptions = {};
  assert.equal(JSON.stringify(frames), '{}');
  const partial: RequestFrames = { frame_count: 2 };
  assert.deepEqual(JSON.parse(JSON.stringify(partial)), { frame_count: 2 });
});
