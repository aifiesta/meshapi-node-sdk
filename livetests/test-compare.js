import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MeshAPI } from "meshapi-node-sdk";
import { BASE_URL, TOKEN, MODEL, SECOND_MODEL } from "./config.js";

const client = new MeshAPI({ baseUrl: BASE_URL, token: TOKEN });

describe("compare (non-streaming)", () => {
  it("returns results for both models", async () => {
    const result = await client.compare.create({
      models: [MODEL, SECOND_MODEL],
      messages: [{ role: "user", content: "What is 2+2? Reply in one word." }],
      skip_comparison: true,
      max_tokens: 20,
    });
    assert.ok(result.comparison_id, "expected comparison_id");
    assert.equal(result.results.length, 2, "expected 2 results");
    const models = result.results.map((r) => r.model);
    assert.ok(models.includes(MODEL), `expected ${MODEL} in results`);
    assert.ok(models.includes(SECOND_MODEL), `expected ${SECOND_MODEL} in results`);
    for (const r of result.results) {
      assert.ok(r.content || r.error, `result for ${r.model} has neither content nor error`);
    }
  });
});

describe("compare (streaming)", () => {
  it("receives events for both models", async () => {
    let count = 0;
    for await (const _event of client.compare.create({
      models: [MODEL, SECOND_MODEL],
      messages: [{ role: "user", content: "Tell me a joke." }],
      skip_comparison: true,
      max_tokens: 50,
      stream: true,
    })) {
      count++;
    }
    assert.ok(count > 0, "expected at least one streaming event");
  });
});

describe("compare (synthesis + overrides)", () => {
  it("exercises the synthesis path (skip_comparison: false)", async () => {
    const result = await client.compare.create({
      models: [MODEL, SECOND_MODEL],
      messages: [{ role: "user", content: "In one sentence, what is TCP?" }],
      comparison_instructions: "Briefly state which answer is clearer.",
      skip_comparison: false,
      max_tokens: 60,
    });
    assert.ok(result.comparison_id);
    assert.equal(result.results.length, 2);
    // When a per-model answer succeeded and the comparison model did not fall
    // back, a synthesized comparison must be present with usage.
    const anyContent = result.results.some((r) => r.content);
    if (anyContent && !result.comparison_fallback_used) {
      assert.ok(result.comparison, "expected a synthesized comparison");
      assert.ok(result.comparison_model, "expected comparison_model to be reported");
      assert.ok(result.comparison_usage, "expected comparison_usage to be populated");
    }
  });

  it("accepts per-model overrides", async () => {
    const result = await client.compare.create({
      models: [MODEL, SECOND_MODEL],
      messages: [{ role: "user", content: "Say hi in one word." }],
      model_overrides: [{ model: MODEL, temperature: 0, max_tokens: 10 }],
      skip_comparison: true,
      max_tokens: 20,
    });
    assert.equal(result.results.length, 2, "overrides must not drop any model from the fan-out");
  });
});
