import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LogsResource } from '../src/resources/logs.js';

function fakeHttp() {
  const calls: Array<{ path: string; options: any }> = [];
  const http = {
    get: async (path: string, options: any) => {
      calls.push({ path, options });
      return { status: 'success', data: [] };
    },
  };
  return { http: http as any, calls };
}

test('bodies calls GET /v1/logs/bodies with cursor', async () => {
  const { http, calls } = fakeHttp();
  await new LogsResource(http).bodies({ limit: 10, cursor: 'abc', start: undefined });
  assert.equal(calls[0].path, '/v1/logs/bodies');
  assert.deepEqual(calls[0].options.query, { limit: 10, cursor: 'abc' });
});

test('loki.queryRange hits query_range', async () => {
  const { http, calls } = fakeHttp();
  await new LogsResource(http).loki.queryRange({ query: '{service="x"}', limit: 5 });
  assert.equal(calls[0].path, '/v1/logs/loki/api/v1/query_range');
  assert.equal(calls[0].options.query.query, '{service="x"}');
});

test('label and detected field names are encoded', async () => {
  const { http, calls } = fakeHttp();
  const logs = new LogsResource(http);
  await logs.loki.labelValues('a/b');
  await logs.loki.detectedFieldValues('x y');
  assert.equal(calls[0].path, '/v1/logs/loki/api/v1/label/a%2Fb/values');
  assert.equal(calls[1].path, '/v1/logs/loki/api/v1/detected_field/x%20y/values');
});

test('series sends match[] as an array', async () => {
  const { http, calls } = fakeHttp();
  await new LogsResource(http).loki.series({ match: '{a="b"}' });
  assert.equal(calls[0].path, '/v1/logs/loki/api/v1/series');
  assert.deepEqual(calls[0].options.query['match[]'], ['{a="b"}']);
});

test('remaining loki paths', async () => {
  const { http, calls } = fakeHttp();
  const loki = new LogsResource(http).loki;
  await loki.query({ query: 'q' });
  await loki.labels();
  await loki.detectedLabels();
  await loki.detectedFields();
  await loki.patterns({ query: 'q' });
  await loki.formatQuery('q');
  await loki.indexStats({ query: 'q' });
  await loki.indexVolume({ query: 'q' });
  await loki.indexVolumeRange({ query: 'q' });
  await loki.buildInfo();
  assert.deepEqual(
    calls.map((c) => c.path.replace('/v1/logs/loki/api/v1', '')),
    ['/query', '/labels', '/detected_labels', '/detected_fields', '/patterns', '/format_query', '/index/stats', '/index/volume', '/index/volume_range', '/status/buildinfo'],
  );
});
