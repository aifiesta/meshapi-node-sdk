import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LogsResource } from '../src/resources/logs.js';

type Call = { method: string; path: string; options?: { query?: Record<string, unknown>; body?: unknown } };

function fakeHttp(responses: unknown[] = []) {
  const calls: Call[] = [];
  const http = {
    async request(method: string, path: string, options?: Call['options']) {
      calls.push({ method, path, options });
      return responses.length ? responses.shift() : { status: 'success', data: [] };
    },
  };
  return { http: http as any, calls };
}

test('queryRange sends GET with query params and drops undefined', async () => {
  const { http, calls } = fakeHttp();
  const logs = new LogsResource(http);
  await logs.loki.queryRange({ query: '{app="x"}', since: '1h', limit: undefined });
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].path, '/v1/logs/loki/api/v1/query_range');
  assert.deepEqual(calls[0].options?.query, { query: '{app="x"}', since: '1h' });
});

test('labelValues and detectedFieldValues encode the name', async () => {
  const { http, calls } = fakeHttp();
  const logs = new LogsResource(http);
  await logs.loki.labelValues('a/b');
  await logs.loki.detectedFieldValues('level name');
  assert.equal(calls[0].path, '/v1/logs/loki/api/v1/label/a%2Fb/values');
  assert.equal(calls[1].path, '/v1/logs/loki/api/v1/detected_field/level%20name/values');
});

test('index, pattern, format and buildinfo paths', async () => {
  const { http, calls } = fakeHttp();
  const loki = new LogsResource(http).loki;
  await loki.query({ query: '{a="b"}' });
  await loki.labels();
  await loki.series({ match: ['{a="b"}'] });
  await loki.detectedLabels();
  await loki.detectedFields();
  await loki.formatQuery('{a="b"}');
  await loki.indexStats({ query: '{a="b"}' });
  await loki.indexVolume({ query: '{a="b"}' });
  await loki.indexVolumeRange({ query: '{a="b"}', step: 60 });
  await loki.patterns({ query: '{a="b"}' });
  await loki.buildInfo();
  assert.deepEqual(
    calls.map((c) => c.path.replace('/v1/logs/loki/api/v1', '')),
    ['/query', '/labels', '/series', '/detected_labels', '/detected_fields', '/format_query', '/index/stats', '/index/volume', '/index/volume_range', '/patterns', '/status/buildinfo'],
  );
  assert.ok(calls.every((c) => c.method === 'GET'));
});

test('bodies passes cursor and iterBodies follows next_cursor', async () => {
  const { http, calls } = fakeHttp([
    { data: [{ id: 1 }], next_cursor: 'c1' },
    { data: [{ id: 2 }], next_cursor: null },
  ]);
  const logs = new LogsResource(http);
  const seen: unknown[] = [];
  for await (const r of logs.iterBodies({ limit: 1 })) seen.push(r);
  assert.deepEqual(seen, [{ id: 1 }, { id: 2 }]);
  assert.equal(calls[0].path, '/v1/logs/bodies');
  assert.deepEqual(calls[0].options?.query, { limit: 1 });
  assert.deepEqual(calls[1].options?.query, { limit: 1, cursor: 'c1' });
});
