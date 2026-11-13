import { test } from "node:test";
import assert from "node:assert/strict";
import type { HttpClient } from "../src/http";
import { LogsResource } from "../src/resources/logs";

function fakeHttp() {
  const calls: string[] = [];
  const http = {
    get: async (path: string) => {
      calls.push(path);
      return { status: "success", data: [] };
    },
  } as unknown as HttpClient;
  return { http, calls };
}

test("bodies hits /v1/logs/bodies with cursor", async () => {
  const { http, calls } = fakeHttp();
  await new LogsResource(http).bodies({ cursor: "abc", limit: 10 });
  assert.equal(calls[0], "/v1/logs/bodies?cursor=abc&limit=10");
});

test("bodies without params has no query string", async () => {
  const { http, calls } = fakeHttp();
  await new LogsResource(http).bodies();
  assert.equal(calls[0], "/v1/logs/bodies");
});

test("queryRange sends each parameter once and skips undefined", async () => {
  const { http, calls } = fakeHttp();
  await new LogsResource(http).loki.queryRange({ query: '{job="x"}', start: 1, end: undefined });
  const url = new URL(calls[0], "https://example.test");
  assert.equal(url.pathname, "/v1/logs/loki/api/v1/query_range");
  assert.deepEqual(url.searchParams.getAll("query"), ['{job="x"}']);
  assert.equal(url.searchParams.has("end"), false);
});

test("name path segments are encoded", async () => {
  const { http, calls } = fakeHttp();
  const logs = new LogsResource(http);
  await logs.loki.labelValues("a/b");
  await logs.loki.detectedFieldValues("level");
  assert.equal(calls[0], "/v1/logs/loki/api/v1/label/a%2Fb/values");
  assert.equal(calls[1], "/v1/logs/loki/api/v1/detected_field/level/values");
});

test("remaining read paths map to the right endpoints", async () => {
  const { http, calls } = fakeHttp();
  const l = new LogsResource(http).loki;
  await l.query({ query: "{a=\"b\"}" });
  await l.labels();
  await l.series();
  await l.detectedFields();
  await l.detectedLabels();
  await l.formatQuery({ query: "x" });
  await l.indexStats();
  await l.indexVolume();
  await l.indexVolumeRange();
  await l.patterns();
  await l.buildinfo();
  const paths = calls.map((c) => c.split("?")[0]);
  assert.deepEqual(paths, [
    "/v1/logs/loki/api/v1/query",
    "/v1/logs/loki/api/v1/labels",
    "/v1/logs/loki/api/v1/series",
    "/v1/logs/loki/api/v1/detected_fields",
    "/v1/logs/loki/api/v1/detected_labels",
    "/v1/logs/loki/api/v1/format_query",
    "/v1/logs/loki/api/v1/index/stats",
    "/v1/logs/loki/api/v1/index/volume",
    "/v1/logs/loki/api/v1/index/volume_range",
    "/v1/logs/loki/api/v1/patterns",
    "/v1/logs/loki/api/v1/status/buildinfo",
  ]);
});
