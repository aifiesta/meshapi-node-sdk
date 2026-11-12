import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LogsResource, type LogsTransport, type LokiQueryParams } from '../src/resources/logs.js';

function fake() {
  const calls: Array<{ path: string; query?: LokiQueryParams }> = [];
  const http: LogsTransport = {
    async get<T>(path: string, query?: LokiQueryParams): Promise<T> {
      calls.push({ path, query });
      return { status: 'success' } as T;
    },
  };
  return { calls, logs: new LogsResource(http) };
}

const P = '/v1/logs/loki/api/v1';

test('each method calls its endpoint', async () => {
  const { calls, logs } = fake();
  await logs.query();
  await logs.queryRange();
  await logs.labels();
  await logs.labelValues('route');
  await logs.series();
  await logs.detectedLabels();
  await logs.detectedFields();
  await logs.detectedFieldValues('latency_ms');
  await logs.patterns();
  await logs.formatQuery();
  await logs.indexStats();
  await logs.indexVolume();
  await logs.indexVolumeRange();
  await logs.buildInfo();
  assert.deepEqual(
    calls.map((c) => c.path),
    [
      `${P}/query`,
      `${P}/query_range`,
      `${P}/labels`,
      `${P}/label/route/values`,
      `${P}/series`,
      `${P}/detected_labels`,
      `${P}/detected_fields`,
      `${P}/detected_field/latency_ms/values`,
      `${P}/patterns`,
      `${P}/format_query`,
      `${P}/index/stats`,
      `${P}/index/volume`,
      `${P}/index/volume_range`,
      `${P}/status/buildinfo`,
    ],
  );
});

test('query params pass through and undefined values are dropped', async () => {
  const { calls, logs } = fake();
  await logs.queryRange({ query: '{service_name="x"}', start: 1, end: undefined, 'match[]': ['{a="b"}'] });
  assert.deepEqual(calls[0].query, { query: '{service_name="x"}', start: 1, 'match[]': ['{a="b"}'] });
});

test('path names are encoded', async () => {
  const { calls, logs } = fake();
  await logs.labelValues('a/b c');
  assert.equal(calls[0].path, `${P}/label/a%2Fb%20c/values`);
});

test('empty names are rejected', () => {
  const { logs } = fake();
  assert.throws(() => logs.labelValues(''), TypeError);
  assert.throws(() => logs.detectedFieldValues(''), TypeError);
});

test('the response body is returned as-is', async () => {
  const { logs } = fake();
  assert.deepEqual(await logs.buildInfo(), { status: 'success' });
});
