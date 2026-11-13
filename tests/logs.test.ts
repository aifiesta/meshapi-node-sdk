import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LogsResource, toLogsQuery, type LogsTransport } from '../src/resources/logs';

interface Call {
  method: string;
  path: string;
  query?: Record<string, string>;
}

function fakeTransport(responses: unknown[] = [{}]): { http: LogsTransport; calls: Call[] } {
  const calls: Call[] = [];
  let i = 0;
  const http: LogsTransport = {
    async request<T>(method: 'GET', path: string, options?: { query?: Record<string, string> }) {
      calls.push({ method, path, query: options?.query });
      const r = responses[Math.min(i, responses.length - 1)];
      i += 1;
      return r as T;
    },
  };
  return { http, calls };
}

test('toLogsQuery drops unset values and serialises dates', () => {
  const q = toLogsQuery({ a: undefined, b: null, c: 5, d: new Date('2026-11-20T00:00:00Z'), e: 'x' });
  assert.deepEqual(q, { c: '5', d: '2026-11-20T00:00:00.000Z', e: 'x' });
});

test('bodies calls GET /v1/logs/bodies with cursor', async () => {
  const { http, calls } = fakeTransport([{ data: [], next_cursor: null }]);
  const logs = new LogsResource(http);
  const page = await logs.bodies({ limit: 10, cursor: 'abc' });
  assert.equal(page.next_cursor, null);
  assert.deepEqual(calls[0], { method: 'GET', path: '/v1/logs/bodies', query: { limit: '10', cursor: 'abc' } });
});

test('iterBodies follows next_cursor until null', async () => {
  const { http, calls } = fakeTransport([
    { data: [{ id: 1 }], next_cursor: 'c1' },
    { data: [{ id: 2 }], next_cursor: null },
  ]);
  const logs = new LogsResource(http);
  const seen: unknown[] = [];
  for await (const r of logs.iterBodies({ limit: 1 })) seen.push(r);
  assert.deepEqual(seen, [{ id: 1 }, { id: 2 }]);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].query?.cursor, 'c1');
});

test('loki read paths map to /v1/logs/loki/api/v1', async () => {
  const { http, calls } = fakeTransport();
  const { loki } = new LogsResource(http);
  await loki.query({ query: '{service="x"}' });
  await loki.queryRange({ query: '{service="x"}', step: '1m' });
  await loki.labels();
  await loki.labelValues('status code', {});
  await loki.series({ match: '{service="x"}' });
  await loki.patterns({ query: '{service="x"}' });
  await loki.detectedFields({ query: '{service="x"}' });
  await loki.detectedFieldValues('latency_ms', { query: '{service="x"}' });
  await loki.detectedLabels({ query: '{service="x"}' });
  await loki.formatQuery('{service="x"}');
  await loki.indexStats({ query: '{service="x"}' });
  await loki.indexVolume({ query: '{service="x"}' });
  await loki.indexVolumeRange({ query: '{service="x"}' });
  await loki.buildInfo();
  const p = '/v1/logs/loki/api/v1';
  assert.deepEqual(
    calls.map((c) => c.path),
    [
      `${p}/query`,
      `${p}/query_range`,
      `${p}/labels`,
      `${p}/label/status%20code/values`,
      `${p}/series`,
      `${p}/patterns`,
      `${p}/detected_fields`,
      `${p}/detected_field/latency_ms/values`,
      `${p}/detected_labels`,
      `${p}/format_query`,
      `${p}/index/stats`,
      `${p}/index/volume`,
      `${p}/index/volume_range`,
      `${p}/status/buildinfo`,
    ],
  );
  assert.ok(calls.every((c) => c.method === 'GET'));
  assert.deepEqual(calls[4].query, { 'match[]': '{service="x"}' });
  assert.deepEqual(calls[13].query, {});
});
