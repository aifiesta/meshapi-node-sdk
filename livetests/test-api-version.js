/**
 * Live checks that the version this SDK pins is one the gateway actually serves.
 *
 * The unit tests prove the header is *sent*. Only a real gateway can prove it is
 * **accepted** — and that is the failure that matters: MeshAPI answers a version it
 * does not serve with `400 invalid_api_version` rather than falling back, so a stale
 * MESH_API_VERSION in a published release breaks every request that release makes.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MeshAPI, MESH_API_VERSION } from "meshapi-node-sdk";
import { BASE_URL, TOKEN } from "./config.js";

const HEADER = "X-Mesh-Version";
const client = new MeshAPI({ baseUrl: BASE_URL, token: TOKEN });

const auth = { Authorization: `Bearer ${TOKEN}` };

/**
 * The gateway's own list of pinnable versions, or `null` if this deployment predates
 * the endpoint.
 *
 * `GET /v1/api-versions` landed in routersvc #1119 and reaches a deployment only on a
 * `v*.*.*` tag, so a 404 means "older than the endpoint" — not a failure of this SDK.
 */
async function servedVersions() {
  const response = await fetch(`${BASE_URL}/v1/api-versions`, { headers: auth });
  if (response.status === 404) return null;
  assert.ok(response.ok, `GET /v1/api-versions → ${response.status}`);
  return response.json();
}

/**
 * The version the gateway says it served.
 *
 * Read under either name on purpose. routersvc renamed the header to
 * `X-Mesh-Version` (#1110), but that reaches a deployment only on a tag — as of
 * 2026-08-12 api-dev echoes `x-mesh-version` and prod still echoes `mesh-version`.
 * Both accept either name on the *request*, so this SDK's pin is honoured on both;
 * only the echo lags. Being strict about the echo name here would report a green SDK
 * as broken against an untagged prod.
 */
function echoed(response) {
  return response.headers.get(HEADER) ?? response.headers.get("Mesh-Version");
}

describe("api version", () => {
  it("the pinned version is served", async () => {
    // The whole point: a real request carrying this SDK's pin must succeed. A failure
    // with `invalid_api_version` means the constant is stale and this release cannot
    // talk to the gateway at all.
    const models = await client.models.list();
    assert.ok(Array.isArray(models) && models.length > 0);
  });

  it("the gateway lists our pinned version", async t => {
    const versions = await servedVersions();
    if (versions === null) {
      return t.skip(`${BASE_URL} predates GET /v1/api-versions (routersvc #1119)`);
    }

    const labels = versions.map(v => v.label);
    assert.ok(
      labels.includes(MESH_API_VERSION),
      `this SDK pins ${MESH_API_VERSION}, which ${BASE_URL} does not serve; served: ${labels.join(", ")}`,
    );
  });

  it("our pinned version is not already sunset", async t => {
    // A version can still be listed while on its way out. A release pinning a sunset
    // version is already broken, it just has not failed yet.
    const versions = await servedVersions();
    if (versions === null) return t.skip("endpoint not deployed");

    const entry = versions.find(v => v.label === MESH_API_VERSION);
    if (!entry) return t.skip("covered by the listing test");
    assert.notEqual(
      entry.status,
      "sunset",
      `this SDK pins ${MESH_API_VERSION}, which is sunset (sunset_on=${entry.sunset_on})`,
    );
  });

  it("the response echoes the version served", async () => {
    const response = await fetch(`${BASE_URL}/v1/models`, {
      headers: { ...auth, [HEADER]: MESH_API_VERSION },
    });
    assert.ok(response.ok, `GET /v1/models → ${response.status}`);
    assert.equal(echoed(response), MESH_API_VERSION);
  });

  it("an unserved version is rejected loudly", async () => {
    // Confirms the gateway does NOT silently fall back — the property the whole
    // pinning scheme rests on. If this returned 200, a typo'd pin would leave a
    // caller believing they were pinned when they were not.
    const response = await fetch(`${BASE_URL}/v1/models`, {
      headers: { ...auth, [HEADER]: "1999-01" },
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error.code, "invalid_api_version");
  });

  it("an unpinned request is served the baseline", async t => {
    // No header means the gateway's baseline, and it says which one it used. This is
    // what `apiVersion: null` opts into.
    const versions = await servedVersions();
    if (versions === null) return t.skip("endpoint not deployed");

    const baseline = versions.find(v => v.baseline)?.label;
    assert.ok(baseline, "the gateway must mark exactly one version as the baseline");

    const response = await fetch(`${BASE_URL}/v1/models`, { headers: auth });
    assert.ok(response.ok, `GET /v1/models → ${response.status}`);
    assert.equal(echoed(response), baseline);
  });
});
