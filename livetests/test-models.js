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

describe("models search/get", () => {
  it("search returns a paginated page", async () => {
    const page = await client.models.search({ limit: 5 });
    assert.ok(typeof page.total === "number" && page.total >= 0, "expected a total");
    assert.equal(page.limit, 5, "page should echo the requested limit");
    assert.ok(page.items.length <= 5, "page must not exceed the limit");
    assert.ok(Array.isArray(page.brands), "expected a brands facet list");
    for (const m of page.items) assert.ok(m.id && m.name, "each model needs id + name");
  });

  it("search q filter matches the query", async () => {
    const page = await client.models.search({ q: "gpt", limit: 10 });
    for (const m of page.items) {
      const hay = `${m.id} ${m.name}`.toLowerCase();
      assert.ok(hay.includes("gpt"), `unexpected model ${m.id} for q='gpt'`);
    }
  });

  it("get by id returns the matching model", async () => {
    const listed = await client.models.list();
    assert.ok(listed.length > 0, "need at least one model to fetch by id");
    const target = listed[0].id;
    const model = await client.models.get(target);
    assert.equal(model.id, target, `get(${target}) returned ${model.id}`);
    assert.ok(model.name);
  });
});
