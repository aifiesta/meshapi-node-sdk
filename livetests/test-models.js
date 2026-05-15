import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MeshAPI } from "meshapi-node-sdk";
import { BASE_URL, TOKEN } from "./config.js";

const client = new MeshAPI({ baseUrl: BASE_URL, token: TOKEN });

describe("models", () => {
  it("list returns non-empty array with required fields", async () => {
    const models = await client.models.list();
    assert.ok(Array.isArray(models) && models.length > 0, "expected at least one model");
    const m = models[0];
    assert.ok(m.id, "model should have an id");
    assert.ok(m.name, "model should have a name");
    assert.ok(typeof m.is_free === "boolean", "is_free should be boolean");
  });

  it("free() returns only free models", async () => {
    const free = await client.models.free();
    assert.ok(Array.isArray(free));
    const bad = free.filter(m => !m.is_free);
    assert.equal(bad.length, 0, `paid models in free list: ${bad.map(m => m.id).join(", ")}`);
  });

  it("paid() returns only paid models", async () => {
    const paid = await client.models.paid();
    assert.ok(Array.isArray(paid));
    const bad = paid.filter(m => m.is_free);
    assert.equal(bad.length, 0, `free models in paid list: ${bad.map(m => m.id).join(", ")}`);
  });

  it("list(free: true) returns only free models", async () => {
    const filtered = await client.models.list({ free: true });
    assert.ok(filtered.every(m => m.is_free), "list(free:true) returned non-free models");
  });

  it("list(free: false) returns only paid models", async () => {
    const filtered = await client.models.list({ free: false });
    assert.ok(filtered.every(m => !m.is_free), "list(free:false) returned free models");
  });
});
