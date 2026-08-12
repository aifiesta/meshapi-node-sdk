/**
 * X-Mesh-Version — the dated API version this SDK was built against (MESH-508).
 *
 * MeshAPI versions its contract by date, in a request header. An SDK that sends
 * nothing is served the gateway's BASELINE — safe today, but it also means the SDK
 * never states which response shape it can actually parse. Sending the version
 * explicitly is the difference between "whatever the server defaults to" and "the
 * shape this release was written for".
 *
 * It works today only because BASELINE is the OLDEST supported version, so it never
 * moves on its own. Pinning turns that from a coincidence into a contract, and puts
 * this release into `usage_events.api_version` so a version can be retired on
 * evidence about who still uses it.
 *
 * Note this is distinct from X-MeshAPI-SDK (tests/sdk-version.test.ts): one says
 * which SDK build, the other which contract. Neither substitutes for the other.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { MeshAPI, MESH_API_VERSION } from "../src/index.js";

const BASE = "https://api.meshapi.test";
const TOKEN = "rsk_test";
const HEADER = "X-Mesh-Version";

function jsonResponse(body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...headers },
  });
}

/** Captures the headers of the next request and echoes the pin back like the gateway. */
function capturing(seen: { headers?: Record<string, string> }): typeof fetch {
  return (async (_input, init) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    seen.headers = headers;
    return jsonResponse([], { [HEADER]: headers[HEADER] ?? "" });
  }) as typeof fetch;
}

describe("X-Mesh-Version", () => {
  describe("the constant", () => {
    it("is exported as a dated label", () => {
      // Public because a caller pinning explicitly needs a value to pass, and a
      // caller debugging a shape mismatch needs to know what was sent.
      assert.equal(MESH_API_VERSION, "2026-08");
    });

    it("is a well-formed YYYY-MM", () => {
      // The gateway 400s a malformed label rather than falling back, so a typo here
      // would break every request this SDK makes, not degrade quietly.
      const match = /^(\d{4})-(\d{2})$/.exec(MESH_API_VERSION);
      assert.ok(match, `${MESH_API_VERSION} is not YYYY-MM`);
      const month = Number(match[2]);
      assert.ok(month >= 1 && month <= 12, `month ${month} out of range`);
    });
  });

  describe("by default", () => {
    it("is sent on outgoing requests", async () => {
      const seen: { headers?: Record<string, string> } = {};
      const client = new MeshAPI({ baseUrl: BASE, token: TOKEN, fetch: capturing(seen) });

      await client.models.list();

      assert.equal(seen.headers?.[HEADER], MESH_API_VERSION);
    });

    it("is sent on multipart uploads too", async () => {
      // The upload path builds its headers separately from buildHeaders() — it must
      // omit Content-Type so fetch can set the multipart boundary. A fix applied to
      // one builder and not the other is exactly the kind of thing that gets missed.
      const seen: { headers?: Record<string, string> } = {};
      const client = new MeshAPI({
        baseUrl: BASE,
        token: TOKEN,
        fetch: (async (_input, init) => {
          seen.headers = (init?.headers ?? {}) as Record<string, string>;
          return jsonResponse({ file_id: "file_1", upload_status: "pending" });
        }) as typeof fetch,
      });

      await client.audio.transcribe(new Uint8Array([1, 2, 3]), { model: "openai/whisper-1" });

      assert.equal(seen.headers?.[HEADER], MESH_API_VERSION);
    });

    it("satisfies a gateway that rejects unknown versions", async () => {
      // Simulates the real gateway instead of asserting against a permissive mock.
      // MeshAPI 400s `invalid_api_version` on a label it does not serve, and treats
      // an EMPTY value as a typo'd pin rather than "no pin". A mock that accepts
      // anything would let both mistakes through.
      const served = new Set([MESH_API_VERSION, "2026-09"]);
      const client = new MeshAPI({
        baseUrl: BASE,
        token: TOKEN,
        fetch: (async (_input, init) => {
          const pinned = ((init?.headers ?? {}) as Record<string, string>)[HEADER];
          if (pinned !== undefined && !served.has(pinned.trim())) {
            return new Response(JSON.stringify({ error: { code: "invalid_api_version" } }), {
              status: 400,
              headers: { "content-type": "application/json" },
            });
          }
          return jsonResponse([]);
        }) as typeof fetch,
      });

      assert.deepEqual(await client.models.list(), []);
    });

    it("does not displace the SDK identity header", async () => {
      const seen: { headers?: Record<string, string> } = {};
      const client = new MeshAPI({ baseUrl: BASE, token: TOKEN, fetch: capturing(seen) });

      await client.models.list();

      assert.ok(seen.headers?.["X-MeshAPI-SDK"]?.startsWith("node/"));
      assert.equal(seen.headers?.[HEADER], MESH_API_VERSION);
    });
  });

  describe("per-client override", () => {
    it("honours an explicit version", async () => {
      // A customer who has migrated ahead of this SDK release must not be forced
      // back onto the version the SDK was built against.
      const seen: { headers?: Record<string, string> } = {};
      const client = new MeshAPI({
        baseUrl: BASE,
        token: TOKEN,
        apiVersion: "2026-09",
        fetch: capturing(seen),
      });

      await client.models.list();

      assert.equal(seen.headers?.[HEADER], "2026-09");
    });

    it("sends nothing when set to null", async () => {
      // Explicit opt-out, distinct from "unset". Omitting the header entirely is how
      // a caller asks for the gateway's baseline whatever it may become — the
      // pre-2.1.0 behaviour, still reachable on purpose.
      const seen: { headers?: Record<string, string> } = {};
      const client = new MeshAPI({
        baseUrl: BASE,
        token: TOKEN,
        apiVersion: null,
        fetch: capturing(seen),
      });

      await client.models.list();

      assert.equal(seen.headers?.[HEADER], undefined);
    });
  });
});
