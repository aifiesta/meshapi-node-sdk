import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MeshAPI, MeshAPIApiError } from "meshapi-node-sdk";
import { BASE_URL, TOKEN, MODEL } from "./config.js";

const client = new MeshAPI({ baseUrl: BASE_URL, token: TOKEN });
const badClient = new MeshAPI({ baseUrl: BASE_URL, token: "rsk_INVALID_TOKEN" });

describe("error handling", () => {
  it("invalid token → 401 MeshAPIApiError on chat", async () => {
    await assert.rejects(
      () => badClient.chat.completions.create({
        model: MODEL,
        messages: [{ role: "user", content: "hello" }],
      }),
      (err) => {
        assert.ok(err instanceof MeshAPIApiError, `expected MeshAPIApiError, got ${err?.constructor?.name}`);
        assert.equal(err.status, 401);
        assert.ok(err.errorCode, "expected errorCode");
        return true;
      },
    );
  });

  it("invalid token → 401 MeshAPIApiError on models", async () => {
    await assert.rejects(
      () => badClient.models.list(),
      (err) => {
        assert.ok(err instanceof MeshAPIApiError);
        assert.equal(err.status, 401);
        return true;
      },
    );
  });

  it("unknown template id → 404 MeshAPIApiError", async () => {
    await assert.rejects(
      () => client.templates.get("tmpl_nonexistent_000000"),
      (err) => {
        assert.ok(err instanceof MeshAPIApiError);
        assert.equal(err.status, 404);
        return true;
      },
    );
  });

  it("MeshAPIApiError is an instance of Error", async () => {
    await assert.rejects(
      () => badClient.models.list(),
      (err) => {
        assert.ok(err instanceof Error);
        assert.ok(err instanceof MeshAPIApiError);
        assert.equal(err.name, "MeshAPIApiError");
        return true;
      },
    );
  });
});
