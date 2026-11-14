import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RequestOptions, Transport } from '../src/resources/_transport.js';
import { VideoRoutesResource } from '../src/resources/video-routes.js';
import { UsageRunsResource, runIdUnreadable } from '../src/resources/usage-runs.js';
import { LogsResource } from '../src/resources/logs.js';

interface Call {
  method: string;
  path: string;
  options?: RequestOptions;
}

function fakeTransport(response: unknown = {}): { http: Transport; calls: Call[] } {
  const calls: Call[] = [];
  const http: Transport = {
    async request<T>(method: 'GET' | 'POST', path: string, options?: RequestOptions): Promise<T> {
      calls.push({ method, path, options });
      return response as T;
    },
  };
  return { http, calls };
}

test('video modality routes post the combined body to their path', async () => {
  const { http, calls } = fakeTransport({ id: 'task_1', status: 'queued' });
  const video = new VideoRoutesResource(http);
  const body = { model: 'provider/video-model', prompt: 'a red square' };
  const task = await video.textToVideo(body);
  await video.imageToVideo(body);
  await video.videoToVideo(body);
  await video.edit(body);
  assert.equal(task.id, 'task_1');
  assert.deepEqual(
    calls.map((c) => `${c.method} ${c.path}`),
    ['POST /v1/video/t2v', 'POST /v1/video/i2v', 'POST /v1/video/v2v', 'POST /v1/video/edits'],
  );
  assert.deepEqual(calls[0].options?.body, body);
});

test('usage runs retrieve encodes the run id', async () => {
  const trace = { run_id: 'run 1', hops: [], total_charged_usd: 0.5, served_rows: 3, truncated: false };
  const { http, calls } = fakeTransport(trace);
  const result = await new UsageRunsResource(http).retrieve('run 1');
  assert.equal(calls[0].path, '/v1/usage/runs/run%201');
  assert.equal(result.served_rows, 3);
});

test('usage runs refuses ids the route cannot address', () => {
  const { http, calls } = fakeTransport();
  const runs = new UsageRunsResource(http);
  assert.throws(() => runs.retrieve('agent/run-42'));
  assert.throws(() => runs.retrieve('.'));
  assert.throws(() => runs.retrieve('..'));
  assert.throws(() => runs.retrieve(''));
  assert.equal(calls.length, 0);
  assert.equal(runIdUnreadable('...'), null);
  assert.equal(runIdUnreadable('my%run'), null);
});

test('logs resource maps Loki paths and drops empty params', async () => {
  const { http, calls } = fakeTransport({ status: 'success' });
  const logs = new LogsResource(http);
  await logs.queryRange({ query: '{app="x"}', start: 1, end: undefined, limit: 10 });
  await logs.labelValues('level');
  await logs.detectedFieldValues('a/b');
  await logs.buildInfo();
  await logs.bodies();
  assert.equal(calls[0].path, '/v1/logs/loki/api/v1/query_range');
  assert.deepEqual(calls[0].options?.query, { query: '{app="x"}', start: 1, limit: 10 });
  assert.equal(calls[1].path, '/v1/logs/loki/api/v1/label/level/values');
  assert.equal(calls[1].options?.query, undefined);
  assert.equal(calls[2].path, '/v1/logs/loki/api/v1/detected_field/a%2Fb/values');
  assert.equal(calls[3].path, '/v1/logs/loki/api/v1/status/buildinfo');
  assert.equal(calls[4].path, '/v1/logs/bodies');
  assert.ok(calls.every((c) => c.method === 'GET'));
});
