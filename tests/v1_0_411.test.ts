import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { HttpClient } from '../src/http.js';
import { LogsResource } from '../src/resources/logs.js';
import { UsageRunsResource, isReadableRunId, RUN_ID_HEADER } from '../src/resources/usage-runs.js';
import { VideoModalityResource, MATCH_SOURCE_DURATION } from '../src/resources/video-modality.js';

interface Call { method: string; path: string; query?: Record<string, string>; body?: unknown }

function fakeHttp(): { http: HttpClient; calls: Call[] } {
  const calls: Call[] = [];
  const http = {
    request: async (opts: Call) => {
      calls.push(opts);
      return {};
    },
  } as unknown as HttpClient;
  return { http, calls };
}

const VIDEO_MODEL = process.env.MESHAPI_VIDEO_MODEL ?? 'video-model';

test('logs.bodies hits /v1/logs/bodies and drops undefined params', async () => {
  const { http, calls } = fakeHttp();
  await new LogsResource(http).bodies({ request_id: 'abc', limit: undefined });
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].path, '/v1/logs/bodies');
  assert.deepEqual(calls[0].query, { request_id: 'abc' });
});

test('loki reads map to their paths', async () => {
  const { http, calls } = fakeHttp();
  const loki = new LogsResource(http).loki;
  await loki.query({ query: '{app="x"}' });
  await loki.queryRange({ query: '{app="x"}', start: 1, end: 2 });
  await loki.labels();
  await loki.labelValues('level');
  await loki.series();
  await loki.patterns();
  await loki.detectedFields();
  await loki.detectedFieldValues('a b');
  await loki.detectedLabels();
  await loki.formatQuery({ query: '{app="x"}' });
  await loki.indexStats();
  await loki.indexVolume();
  await loki.indexVolumeRange();
  await loki.buildInfo();
  const base = '/v1/logs/loki/api/v1';
  assert.deepEqual(calls.map((c) => c.path), [
    `${base}/query`, `${base}/query_range`, `${base}/labels`, `${base}/label/level/values`,
    `${base}/series`, `${base}/patterns`, `${base}/detected_fields`, `${base}/detected_field/a%20b/values`,
    `${base}/detected_labels`, `${base}/format_query`, `${base}/index/stats`, `${base}/index/volume`,
    `${base}/index/volume_range`, `${base}/status/buildinfo`,
  ]);
  assert.deepEqual(calls[1].query, { query: '{app="x"}', start: '1', end: '2' });
});

test('usage runs retrieve encodes the id', async () => {
  const { http, calls } = fakeHttp();
  await new UsageRunsResource(http).retrieve('run 42');
  assert.equal(calls[0].path, '/v1/usage/runs/run%2042');
  assert.equal(RUN_ID_HEADER, 'X-Mesh-Run-Id');
});

test('unreadable run ids are refused before sending', () => {
  const { http, calls } = fakeHttp();
  const runs = new UsageRunsResource(http);
  for (const id of ['', 'agent/run-42', '.', '..']) {
    assert.equal(isReadableRunId(id), false);
    assert.throws(() => runs.retrieve(id));
  }
  assert.equal(isReadableRunId('...'), true);
  assert.equal(calls.length, 0);
});

test('video modality submits post the combined body', async () => {
  const { http, calls } = fakeHttp();
  const video = new VideoModalityResource(http);
  const body = { model: VIDEO_MODEL, prompt: 'a red square', duration: MATCH_SOURCE_DURATION };
  await video.t2v(body);
  await video.i2v(body);
  await video.v2v(body);
  await video.edits(body);
  assert.deepEqual(calls.map((c) => c.path), ['/v1/video/t2v', '/v1/video/i2v', '/v1/video/v2v', '/v1/video/edits']);
  for (const c of calls) {
    assert.equal(c.method, 'POST');
    assert.deepEqual(c.body, body);
  }
});
