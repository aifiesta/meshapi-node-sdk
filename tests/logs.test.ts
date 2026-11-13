import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LogsResource, buildLogsQuery, type LogsTransport } from '../src/resources/logs';

function fake(responses: unknown[] = [{}]) {
  const paths: string[] = [];
  let i = 0;
  const http: LogsTransport = {
    async get<T>(path: string): Promise<T> {
      paths.push(path);
      const r = responses[Math.min(i, responses.length - 1)];
      i += 1;
      return r as T;
    },
  };
  return { http, paths };
}

test('buildLogsQuery skips empty values and repeats arrays', () => {
  assert.equal(buildLogsQuery({ a: 1, b: undefined, c: null, 'match[]': ['x', 'y'] }), '?a=1&match%5B%5D=x&match%5B%5D=y');
  assert.equal(buildLogsQuery({}), '');
  assert.equal(buildLogsQuery({ t: new Date('2025-01-01T00:00:00Z') }), '?t=2025-01-01T00%3A00%3A00.000Z');
});

test('bodies calls GET /v1/logs/bodies with cursor', async () => {
  const { http, paths } = fake([{ data: [], next_cursor: null }]);
  await new LogsResource(http).bodies({ limit: 10, cursor: 'abc' });
  assert.equal(paths[0], '/v1/logs/bodies?limit=10&cursor=abc');
});

test('iterBodies follows next_cursor', async () => {
  const { http, paths } = fake([
    { data: [{ id: 1 }], next_cursor: 'c2' },
    { data: [{ id: 2 }], next_cursor: null },
  ]);
  const seen: unknown[] = [];
  for await (const r of new LogsResource(http).iterBodies()) seen.push(r);
  assert.deepEqual(seen, [{ id: 1 }, { id: 2 }]);
  assert.equal(paths[1], '/v1/logs/bodies?cursor=c2');
});

test('loki methods hit the expected paths', async () => {
  const { http, paths } = fake();
  const loki = new LogsResource(http).loki;
  await loki.query({ query: '{a="b"}' });
  await loki.queryRange({ query: '{a="b"}', start: 1, end: 2 });
  await loki.labels();
  await loki.labelValues('a/b');
  await loki.series({ match: '{a="b"}' });
  await loki.detectedFields();
  await loki.detectedFieldValues('status');
  await loki.detectedLabels();
  await loki.formatQuery({ query: '{a="b"}' });
  await loki.indexStats({ query: '{a="b"}' });
  await loki.indexVolume({ query: '{a="b"}' });
  await loki.indexVolumeRange({ query: '{a="b"}', step: 60 });
  await loki.patterns({ query: '{a="b"}' });
  await loki.buildInfo();
  const base = '/v1/logs/loki/api/v1';
  const q = encodeURIComponent('{a="b"}');
  assert.deepEqual(paths, [
    `${base}/query?query=${q}`,
    `${base}/query_range?query=${q}&start=1&end=2`,
    `${base}/labels`,
    `${base}/label/a%2Fb/values`,
    `${base}/series?match%5B%5D=${q}`,
    `${base}/detected_fields`,
    `${base}/detected_field/status/values`,
    `${base}/detected_labels`,
    `${base}/format_query?query=${q}`,
    `${base}/index/stats?query=${q}`,
    `${base}/index/volume?query=${q}`,
    `${base}/index/volume_range?query=${q}&step=60`,
    `${base}/patterns?query=${q}`,
    `${base}/status/buildinfo`,
  ]);
});
