import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../src/types-image-frames';
import type { ImageGenerationRequest, ImageOptions } from '../src/types';

test('ImageGenerationRequest accepts frame_count and frame_duration_ms', () => {
  const fields: Pick<ImageGenerationRequest, 'frame_count' | 'frame_duration_ms'> = {
    frame_count: 4,
    frame_duration_ms: 120,
  };
  const body = JSON.parse(JSON.stringify(fields));
  assert.equal(body.frame_count, 4);
  assert.equal(body.frame_duration_ms, 120);
});

test('ImageOptions accepts frame_count and frame_duration_ms', () => {
  const fields: Pick<ImageOptions, 'frame_count' | 'frame_duration_ms'> = {
    frame_count: 16,
    frame_duration_ms: 20,
  };
  const body = JSON.parse(JSON.stringify(fields));
  assert.deepEqual(body, { frame_count: 16, frame_duration_ms: 20 });
});

test('frame fields are optional and omitted from the body when unset', () => {
  const fields: Pick<ImageGenerationRequest, 'frame_count' | 'frame_duration_ms'> = {};
  const body = JSON.parse(JSON.stringify(fields));
  assert.equal('frame_count' in body, false);
  assert.equal('frame_duration_ms' in body, false);
});
