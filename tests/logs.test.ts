import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LogsResource, type LogsTransport } from '../src/resources/logs';

interface Call {
  path: string;
  query?: Record<string, string | number | boolean>;
}

function fakeTransport(response: unknown = { status: 'success', data: [] }) {
  const calls: Call[] = [];
  const http: LogsTransport = {
    async get<T>(path: string, query?: Record<string, string | number | boolean>): Promise<T> {
      calls.push({ path, query });
      return response as T;
    },
  };
  return { http, calls };
}

test('bodies calls GET /v1/logs/bodies with the cursor', async () => {
  const { http, calls } = fakeTransport({ next_cursor: 'abc' });
  const logs = new LogsResource(http);
  const page = await logs.bodies({ cursor: 'xyz' });
  assert.equal(calls[0].path, '/v1/logs/bodies');
  assert.deepEqual(calls[0].query, { cursor: 'xyz' });
  assert.equal(page.next_cursor, 'abc');
});

test('bodies drops undefined params', async () => {
  const { http, calls } = fakeTransport({});
  await new LogsResource(http).bodies({ cursor: undefined });
  assert.deepEqual(calls[0].query, {});
});

test('loki read paths map to /v1/logs/loki/api/v1', async () => {
  const { http, calls } = fakeTransport();
  const { loki } = new LogsResource(http);
  await loki.query({ query: '{app="x"}', limit: 10 });
  await loki.queryRange({ query: '{app="x"}', start: 1, end: 2 });
  await loki.labels();
  await loki.series();
  await loki.detectedFields();
  await loki.detectedLabels();
  await loki.formatQuery({ query: '{app="x"}' });
  await loki.indexStats();
  await loki.indexVolume();
  await loki.indexVolumeRange();
  await loki.patterns();
  await loki.buildInfo();
  assert.deepEqual(
    calls.map((c) => c.path),
    [
      '/v1/logs/loki/api/v1/query',
      '/v1/logs/loki/api/v1/query_range',
      '/v1/logs/loki/api/v1/labels',
      '/v1/logs/loki/api/v1/series',
      '/v1/logs/loki/api/v1/detected_fields',
      '/v1/logs/loki/api/v1/detected_labels',
      '/v1/logs/loki/api/v1/format_query',
      '/v1/logs/loki/api/v1/index/stats',
      '/v1/logs/loki/api/v1/index/volume',
      '/v1/logs/loki/api/v1/index/volume_range',
      '/v1/logs/loki/api/v1/patterns',
      '/v1/logs/loki/api/v1/status/buildinfo',
    ],
  );
  assert.deepEqual(calls[0].query, { query: '{app="x"}', limit: 10 });
});

test('label and detected field names are URL-encoded', async () => {
  const { http, calls } = fakeTransport();
  const { loki } = new LogsResource(http);
  await loki.labelValues('a/b c');
  await loki.detectedFieldValues('x/y');
  assert.equal(calls[0].path, '/v1/logs/loki/api/v1/label/a%2Fb%20c/values');
  assert.equal(calls[1].path, '/v1/logs/loki/api/v1/detected_field/x%2Fy/values');
});
