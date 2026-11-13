import { test } from "node:test";
import assert from "node:assert/strict";
import { LogsResource } from "../src/resources/logs.js";

function fakeHttp() {
  const calls: Array<{ path: string; params: unknown }> = [];
  const http = {
    async get(path: string, params?: unknown) {
      calls.push({ path, params });
      return { status: "success", data: [] };
    },
  };
  return { http: http as any, calls };
}

test("bodies calls GET /v1/logs/bodies with the cursor", async () => {
  const { http, calls } = fakeHttp();
  const logs = new LogsResource(http);
  await logs.bodies({ cursor: "abc" });
  assert.equal(calls[0].path, "/v1/logs/bodies");
  assert.deepEqual(calls[0].params, { cursor: "abc" });
});

test("loki read paths map to the documented endpoints", async () => {
  const { http, calls } = fakeHttp();
  const loki = new LogsResource(http).loki;
  await loki.query({ query: "{service_name=\"x\"}" });
  await loki.queryRange({ query: "{a=\"b\"}", start: 1, end: 2 });
  await loki.labels();
  await loki.series();
  await loki.detectedFields();
  await loki.detectedLabels();
  await loki.patterns();
  await loki.formatQuery({ query: "{a=\"b\"}" });
  await loki.indexStats();
  await loki.indexVolume();
  await loki.indexVolumeRange();
  await loki.buildInfo();
  assert.deepEqual(
    calls.map((c) => c.path),
    [
      "/v1/logs/loki/api/v1/query",
      "/v1/logs/loki/api/v1/query_range",
      "/v1/logs/loki/api/v1/labels",
      "/v1/logs/loki/api/v1/series",
      "/v1/logs/loki/api/v1/detected_fields",
      "/v1/logs/loki/api/v1/detected_labels",
      "/v1/logs/loki/api/v1/patterns",
      "/v1/logs/loki/api/v1/format_query",
      "/v1/logs/loki/api/v1/index/stats",
      "/v1/logs/loki/api/v1/index/volume",
      "/v1/logs/loki/api/v1/index/volume_range",
      "/v1/logs/loki/api/v1/status/buildinfo",
    ],
  );
});

test("path parameters are URL-encoded", async () => {
  const { http, calls } = fakeHttp();
  const loki = new LogsResource(http).loki;
  await loki.labelValues("service name");
  await loki.detectedFieldValues("a/b");
  assert.equal(calls[0].path, "/v1/logs/loki/api/v1/label/service%20name/values");
  assert.equal(calls[1].path, "/v1/logs/loki/api/v1/detected_field/a%2Fb/values");
});
