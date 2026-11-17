import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ImageGenerationRequest, ImageOptions } from '../src/types';
import '../src/image-frames';

test('ImageGenerationRequest serialises frame_count and frame_duration_ms', () => {
  const req = {
    prompt: 'a spinning cube',
    output_format: 'gif',
    frame_count: 8,
    frame_duration_ms: 100,
  } as ImageGenerationRequest;
  const body = JSON.parse(JSON.stringify(req));
  assert.equal(body.frame_count, 8);
  assert.equal(body.frame_duration_ms, 100);
});

test('ImageOptions serialises frame_count and frame_duration_ms', () => {
  const opts = {
    output_format: 'gif',
    frame_count: 2,
    frame_duration_ms: 20,
  } as ImageOptions;
  const body = JSON.parse(JSON.stringify(opts));
  assert.equal(body.frame_count, 2);
  assert.equal(body.frame_duration_ms, 20);
});

test('frame fields are omitted when not set', () => {
  const req = { prompt: 'a cube' } as ImageGenerationRequest;
  const body = JSON.parse(JSON.stringify(req));
  assert.equal('frame_count' in body, false);
  assert.equal('frame_duration_ms' in body, false);
});
