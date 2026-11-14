import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LogsResource } from '../src/resources/logs.js';
import { UsageRunsResource } from '../src/resources/usageRuns.js';
import { VideoModalityResource } from '../src/resources/videoModality.js';

interface Call {
  method: string;
  path: string;
  opts?: { query?: unknown; body?: unknown };
}

function fakeHttp(response: unknown = {}) {
  const calls: Call[] = [];
  const http = {
    request: async (method: string, path: string, opts?: Call['opts']) => {
      calls.push({ method, path, opts });
      return response;
    },
  };
  return { http: http as never, calls };
}

test('logs.queryRange calls GET query_range with params', async () => {
  const { http, calls } = fakeHttp();
  await new LogsResource(http).queryRange({ query: '{app="x"}', limit: 10 });
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].path, '/v1/logs/loki/api/v1/query_range');
  assert.deepEqual(calls[0].opts?.query, { query: '{app="x"}', limit: 10 });
});

test('logs.labelValues encodes the label name', async () => {
  const { http, calls } = fakeHttp();
  await new LogsResource(http).labelValues('a/b');
  assert.equal(calls[0].path, '/v1/logs/loki/api/v1/label/a%2Fb/values');
});

test('logs.detectedFieldValues and bodies use their paths', async () => {
  const { http, calls } = fakeHttp();
  const logs = new LogsResource(http);
  await logs.detectedFieldValues('level');
  await logs.bodies();
  await logs.buildInfo();
  assert.equal(calls[0].path, '/v1/logs/loki/api/v1/detected_field/level/values');
  assert.equal(calls[1].path, '/v1/logs/bodies');
  assert.equal(calls[2].path, '/v1/logs/loki/api/v1/status/buildinfo');
});

test('usage runs retrieve returns the trace', async () => {
  const trace = { run_id: 'run-42', hops: [], total_charged_usd: 0.01, served_rows: 2, truncated: false };
  const { http, calls } = fakeHttp(trace);
  const out = await new UsageRunsResource(http).retrieve('run-42');
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].path, '/v1/usage/runs/run-42');
  assert.equal(out.total_charged_usd, 0.01);
  assert.equal(out.truncated, false);
});

test('video modality routes POST the body to their path', async () => {
  const { http, calls } = fakeHttp({ id: 'task_1', status: 'queued' });
  const video = new VideoModalityResource(http);
  const body = { model: 'example-video-model', prompt: 'a red ball' };
  await video.t2v(body);
  await video.i2v(body);
  await video.v2v(body);
  await video.edits(body);
  assert.deepEqual(
    calls.map((c) => [c.method, c.path]),
    [
      ['POST', '/v1/video/t2v'],
      ['POST', '/v1/video/i2v'],
      ['POST', '/v1/video/v2v'],
      ['POST', '/v1/video/edits'],
    ],
  );
  assert.deepEqual(calls[0].opts?.body, body);
});
