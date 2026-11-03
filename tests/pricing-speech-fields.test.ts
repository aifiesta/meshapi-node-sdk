import { test } from "node:test";
import assert from "node:assert/strict";
import type { ModelPricing, SpeechRequest } from "../src/index.js";

// v1.0.377 adds two optional fields. These tests check that the fields
// are typed and that they serialise as plain JSON keys.

test("ModelPricing carries long_context_cache_write_1h_input_usd_per_1m", () => {
  const priced: Pick<ModelPricing, "long_context_cache_write_1h_input_usd_per_1m"> = {
    long_context_cache_write_1h_input_usd_per_1m: 1,
  };
  const parsed = JSON.parse(JSON.stringify(priced));
  assert.equal(parsed.long_context_cache_write_1h_input_usd_per_1m, 1);
});

test("ModelPricing accepts null for long_context_cache_write_1h_input_usd_per_1m", () => {
  const unpriced: Pick<ModelPricing, "long_context_cache_write_1h_input_usd_per_1m"> = {
    long_context_cache_write_1h_input_usd_per_1m: null,
  };
  assert.equal(unpriced.long_context_cache_write_1h_input_usd_per_1m, null);
});

test("ModelPricing field is optional", () => {
  const absent: Pick<ModelPricing, "long_context_cache_write_1h_input_usd_per_1m"> = {};
  assert.equal("long_context_cache_write_1h_input_usd_per_1m" in absent, false);
});

test("SpeechRequest serialises speed at the top level", () => {
  const body: Pick<SpeechRequest, "speed"> = { speed: 1.5 };
  const parsed = JSON.parse(JSON.stringify(body));
  assert.equal(parsed.speed, 1.5);
});

test("SpeechRequest omits speed when unset", () => {
  const body: Pick<SpeechRequest, "speed"> = {};
  const parsed = JSON.parse(JSON.stringify(body));
  assert.equal("speed" in parsed, false);
});
