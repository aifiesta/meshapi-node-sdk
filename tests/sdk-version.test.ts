/**
 * X-MeshAPI-SDK version header.
 *
 * The constant in src/http.ts and the version in package.json are two places
 * that must agree; they drifted once already (1.0.4 shipped reporting
 * node/0.1.3), so a release cannot pass CI while they disagree.
 *
 * Previously lived in tests/on-response.test.ts, which was removed along with
 * the `onResponse` hook.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

import { MeshAPI } from "../src/index.js";
import { SDK_VERSION_VALUE } from "../src/http.js";

const BASE = "https://api.meshapi.test";
const TOKEN = "rsk_test";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("X-MeshAPI-SDK version header", () => {
  const pkgVersion = () => {
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
    return (JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string }).version;
  };

  it("the shared constant matches package.json", () => {
    // Covers both consumers of the constant: HttpClient and RealtimeResource.
    assert.equal(
      SDK_VERSION_VALUE,
      `node/${pkgVersion()}`,
      "SDK_VERSION_VALUE in src/http.ts is out of sync with package.json",
    );
  });

  it("is sent on outgoing requests", async () => {
    const version = pkgVersion();

    let sent: Record<string, string> | undefined;
    const client = new MeshAPI({
      baseUrl: BASE,
      token: TOKEN,
      fetch: async (_input, init) => {
        sent = init?.headers as Record<string, string>;
        return jsonResponse([]);
      },
    });
    await client.models.list();

    assert.equal(
      sent?.["X-MeshAPI-SDK"],
      `node/${version}`,
      "SDK_VERSION_VALUE in src/http.ts is out of sync with package.json",
    );
  });
});
