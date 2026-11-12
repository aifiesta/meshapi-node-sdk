import { test } from "node:test";
import assert from "node:assert/strict";
import { LogsResource } from "../src/resources/logs.js";

function fakeHttp() {
  const calls: Array<{ method: string; path: string; query?: Record<string, unknown> }> = [];
  const http = {
    async request(opts: { method: string; path: string; query?: Record<string, unknown> }) {
      calls.push(opts);
      return { status: "success", data: [] };
    },
  };
  return { http: http as any, calls };
}

test("bodies sends GET /v1/logs/bodies with cursor", async () => {
  const { http, calls } = fakeHttp();
  await new LogsResource(http).bodies({ cursor: "abc", limit: 10, end: undefined });
  assert.equal(calls[0].method, "GET");
  assert.equal(calls[0].path, "/v1/logs/bodies");
  assert.deepEqual(calls[0].query, { cursor: "abc", limit: 10 });
});

test("loki.queryRange hits query_range", async () => {
  const { http, calls } = fakeHttp();
  await new LogsResource(http).loki.queryRange({ query: '{service="x"}', limit: 5 });
  assert.equal(calls[0].path, "/v1/logs/loki/api/v1/query_range");
  assert.deepEqual(calls[0].query, { query: '{service="x"}', limit: 5 });
});

test("loki.labelValues encodes the label name", async () => {
  const { http, calls } = fakeHttp();
  await new LogsResource(http).loki.labelValues("a/b");
  assert.equal(calls[0].path, "/v1/logs/loki/api/v1/label/a%2Fb/values");
});

test("loki.detectedFieldValues encodes the field name", async () => {
  const { http, calls } = fakeHttp();
  await new LogsResource(http).loki.detectedFieldValues("status code");
  assert.equal(calls[0].path, "/v1/logs/loki/api/v1/detected_field/status%20code/values");
});

test("loki.series sends match[] as an array", async () => {
  const { http, calls } = fakeHttp();
  await new LogsResource(http).loki.series({ match: '{a="b"}' });
  assert.equal(calls[0].path, "/v1/logs/loki/api/v1/series");
  assert.deepEqual(calls[0].query, { "match[]": ['{a="b"}'] });
});

test("remaining loki paths", async () => {
  const { http, calls } = fakeHttp();
  const loki = new LogsResource(http).loki;
  await loki.query({ query: "{a=\"b\"}" });
  await loki.labels();
  await loki.indexStats({ query: "{a=\"b\"}" });
  await loki.indexVolume({ query: "{a=\"b\"}" });
  await loki.indexVolumeRange({ query: "{a=\"b\"}" });
  await loki.patterns({ query: "{a=\"b\"}" });
  await loki.detectedFields();
  await loki.detectedLabels();
  await loki.formatQuery("{a=\"b\"}");
  await loki.buildInfo();
  const base = "/v1/logs/loki/api/v1";
  assert.deepEqual(
    calls.map((c) => c.path),
    [
      `${base}/query`,
      `${base}/labels`,
      `${base}/index/stats`,
      `${base}/index/volume`,
      `${base}/index/volume_range`,
      `${base}/patterns`,
      `${base}/detected_fields`,
      `${base}/detected_labels`,
      `${base}/format_query`,
      `${base}/status/buildinfo`,
    ],
  );
  assert.ok(calls.every((c) => c.method === "GET"));
});
