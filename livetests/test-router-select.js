import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MeshAPI, MeshAPIApiError } from "meshapi-node-sdk";
import { BASE_URL, TOKEN } from "./config.js";

const client = new MeshAPI({ baseUrl: BASE_URL, token: TOKEN });

// Gated server-side by AUTO_ROUTER_ENABLED — disabled deployments return 403/404.
function disabled(err) {
  return err instanceof MeshAPIApiError && [403, 404, 501].includes(err.status);
}

describe("router select", () => {
  it("returns a model (fail-soft)", async (t) => {
    let resp;
    try {
      resp = await client.router.select({
        messages: [{ role: "user", content: "Write a Python function to reverse a string." }],
      });
    } catch (err) {
      if (disabled(err)) return t.skip(`auto router disabled (AUTO_ROUTER_ENABLED): ${err.errorCode}`);
      throw err;
    }
    assert.ok(resp.model, "router must always return a model");
    assert.ok(resp.auto_router, "expected auto_router metadata");
  });

  it("honors exclusions", async (t) => {
    const excluded = "openai/gpt-4o-mini";
    let resp;
    try {
      resp = await client.router.select({
        messages: [{ role: "user", content: "Explain the theory of relativity simply." }],
        exclude_models: [excluded],
      });
    } catch (err) {
      if (disabled(err)) return t.skip(`auto router disabled: ${err.errorCode}`);
      throw err;
    }
    assert.ok(resp.model, "router must return a model even with exclusions");
    if (!resp.auto_router.fallback_used) {
      assert.notEqual(resp.model, excluded, "excluded model should not be selected");
    }
  });
});
