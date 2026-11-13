import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VideoRoutesResource } from '../src/resources/video-routes.js';
import { MATCH_SOURCE_DURATION } from '../src/video-routes-types.js';

function fakeHttp() {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const http = {
    async request(method: string, path: string, options?: { body?: unknown }) {
      calls.push({ method, path, body: options?.body });
      return { id: 'task_1', status: 'queued' };
    },
  };
  return { http: http as any, calls };
}

test('each modality posts to its own route with the shared body', async () => {
  const { http, calls } = fakeHttp();
  const video = new VideoRoutesResource(http);
  const body = { model: 'example/video-model', prompt: 'a kite' };
  await video.textToVideo(body);
  await video.imageToVideo(body);
  await video.videoToVideo({ ...body, duration: MATCH_SOURCE_DURATION });
  const task = await video.edit(body);
  assert.deepEqual(calls.map((c) => c.path), ['/v1/video/t2v', '/v1/video/i2v', '/v1/video/v2v', '/v1/video/edits']);
  assert.ok(calls.every((c) => c.method === 'POST'));
  assert.equal((calls[2].body as { duration: number }).duration, -1);
  assert.equal(task.id, 'task_1');
});
