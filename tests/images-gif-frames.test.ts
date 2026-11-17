import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MeshAPI } from '../src/index.js';
import type { ImageGenerationRequest, ImageOptions } from '../src/index.js';

/**
 * Contract tests for the GIF frame controls added in spec v1.0.418:
 * `ImageGenerationRequest.frame_count` / `frame_duration_ms` and
 * `ImageOptions.frame_count` / `frame_duration_ms`.
 */

type Captured = { url: string; body: Record<string, unknown> };

function mockFetch(captured: Captured[]): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    captured.push({
      url: String(input),
      body: init?.body ? JSON.parse(String(init.body)) : {},
    });
    return new Response(
      JSON.stringify({ created: 1, data: [{ b64_json: 'R0lGODlh' }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

test('ImageGenerationRequest accepts frame_count and frame_duration_ms', () => {
  const req: ImageGenerationRequest = {
    model: 'openai/gpt-image-2.6-flare',
    prompt: 'a spinning cube',
    output_format: 'gif',
    frame_count: 8,
    frame_duration_ms: 100,
  };
  assert.equal(req.frame_count, 8);
  assert.equal(req.frame_duration_ms, 100);
});

test('ImageOptions accepts frame_count and frame_duration_ms', () => {
  const opts: ImageOptions = {
    output_format: 'gif',
    frame_count: 4,
    frame_duration_ms: 20,
  };
  assert.equal(opts.frame_count, 4);
  assert.equal(opts.frame_duration_ms, 20);
});

test('frame fields are optional', () => {
  const req: ImageGenerationRequest = {
    model: 'openai/gpt-image-2.6-flare',
    prompt: 'a spinning cube',
    output_format: 'gif',
  };
  assert.equal(req.frame_count, undefined);
  assert.equal(req.frame_duration_ms, undefined);
});

test('images.generate sends frame_count and frame_duration_ms in the body', async () => {
  const captured: Captured[] = [];
  const restore = mockFetch(captured);
  try {
    const client = new MeshAPI({ token: 'rsk_test', baseUrl: 'https://api.meshapi.ai' });
    await client.images.generate({
      model: 'openai/gpt-image-2.6-flare',
      prompt: 'a spinning cube',
      output_format: 'gif',
      frame_count: 6,
      frame_duration_ms: 80,
    });
    assert.equal(captured.length, 1);
    assert.ok(captured[0].url.endsWith('/v1/images/generations'));
    assert.equal(captured[0].body.output_format, 'gif');
    assert.equal(captured[0].body.frame_count, 6);
    assert.equal(captured[0].body.frame_duration_ms, 80);
  } finally {
    restore();
  }
});

test('images.generate omits frame fields when not set', async () => {
  const captured: Captured[] = [];
  const restore = mockFetch(captured);
  try {
    const client = new MeshAPI({ token: 'rsk_test', baseUrl: 'https://api.meshapi.ai' });
    await client.images.generate({
      model: 'openai/gpt-image-2.6-flare',
      prompt: 'a spinning cube',
    });
    assert.equal('frame_count' in captured[0].body, false);
    assert.equal('frame_duration_ms' in captured[0].body, false);
  } finally {
    restore();
  }
});
