import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { MeshAPI, MeshAPIApiError } from '../src/index.ts';
import type { ImageGenerationRequest, ImageOptions } from '../src/types.ts';

const realFetch = globalThis.fetch;

interface Captured {
  url: string;
  body: unknown;
}

function mockFetch(status: number, payload: unknown, captured: Captured[]): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    captured.push({
      url: String(input),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    return new Response(JSON.stringify(payload), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
}

function client(): MeshAPI {
  return new MeshAPI({ apiKey: 'rsk_test', baseUrl: 'https://api.meshapi.ai' });
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

test('ImageGenerationRequest accepts frame_count and frame_duration_ms', () => {
  const req: ImageGenerationRequest = {
    model: 'openai/gpt-image-2.6-flare',
    prompt: 'A paper boat bobbing on a pond',
    frame_count: 8,
    frame_duration_ms: 120,
  };
  assert.equal(req.frame_count, 8);
  assert.equal(req.frame_duration_ms, 120);
});

test('ImageOptions accepts frame_count and frame_duration_ms', () => {
  const opts: ImageOptions = { frame_count: 4, frame_duration_ms: 50 };
  assert.equal(opts.frame_count, 4);
  assert.equal(opts.frame_duration_ms, 50);
});

test('images.generate sends frame_count and frame_duration_ms in the body', async () => {
  const captured: Captured[] = [];
  mockFetch(200, { created: 1, data: [{ b64_json: 'R0lGODlh' }] }, captured);

  await client().images.generate({
    model: 'openai/gpt-image-2.6-flare',
    prompt: 'A paper boat bobbing on a pond',
    frame_count: 8,
    frame_duration_ms: 120,
  });

  assert.equal(captured.length, 1);
  assert.ok(captured[0].url.endsWith('/v1/images/generations'));
  const body = captured[0].body as Record<string, unknown>;
  assert.equal(body.frame_count, 8);
  assert.equal(body.frame_duration_ms, 120);
});

test('images.generate omits frame fields when not set', async () => {
  const captured: Captured[] = [];
  mockFetch(200, { created: 1, data: [{ b64_json: 'iVBORw0K' }] }, captured);

  await client().images.generate({
    model: 'openai/gpt-image-2.6-flare',
    prompt: 'A paper boat',
  });

  const body = captured[0].body as Record<string, unknown>;
  assert.equal('frame_count' in body, false);
  assert.equal('frame_duration_ms' in body, false);
});

test('moderations.create surfaces a 404 model_not_found as MeshAPIApiError', async () => {
  const captured: Captured[] = [];
  mockFetch(
    404,
    { error: { code: 'model_not_found', message: 'The model does not exist.', type: 'invalid_request_error' } },
    captured,
  );

  await assert.rejects(
    client().moderations.create({ model: 'not-a-moderation-model', input: 'hello' }),
    (err: unknown) => {
      assert.ok(err instanceof MeshAPIApiError);
      assert.equal((err as MeshAPIApiError).status, 404);
      return true;
    },
  );
  assert.ok(captured[0].url.endsWith('/v1/moderations'));
});
