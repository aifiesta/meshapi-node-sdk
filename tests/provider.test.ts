import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appendProviderField,
  assertMaxCompletionTokens,
  costLineQuantity,
  isCostLineCharged,
  type ChatCompletionRequestV1_0_364,
  type CostLineOut,
} from "../src/provider";

test("provider and max_completion_tokens serialise on the chat body", () => {
  const body: ChatCompletionRequestV1_0_364 = { provider: "openai", max_completion_tokens: 64 };
  assert.deepEqual(JSON.parse(JSON.stringify(body)), { provider: "openai", max_completion_tokens: 64 });
});

test("assertMaxCompletionTokens accepts positive integers and absent values", () => {
  assert.doesNotThrow(() => assertMaxCompletionTokens(1));
  assert.doesNotThrow(() => assertMaxCompletionTokens(undefined));
  assert.doesNotThrow(() => assertMaxCompletionTokens(null));
});

test("assertMaxCompletionTokens rejects zero, negatives and fractions", () => {
  for (const v of [0, -5, 1.5, Number.NaN]) {
    assert.throws(() => assertMaxCompletionTokens(v), RangeError);
  }
});

test("appendProviderField adds a text part only when set", () => {
  const set = appendProviderField(new FormData(), "openai");
  assert.equal(set.get("provider"), "openai");
  const unset = appendProviderField(new FormData(), undefined);
  assert.equal(unset.has("provider"), false);
});

test("costLineQuantity reads quantity for non-token lines with null tokens", () => {
  const line: CostLineOut = { tokens: null, rate_per_1m_usd: null, quantity: 5, unit: "seconds", rate_usd: "0.1" };
  assert.deepEqual(costLineQuantity(line), { quantity: 5, unit: "seconds" });
});

test("costLineQuantity falls back to tokens", () => {
  assert.deepEqual(costLineQuantity({ tokens: 1200, rate_per_1m_usd: "2.5" }), { quantity: 1200, unit: "tokens" });
  assert.deepEqual(costLineQuantity({}), { quantity: null, unit: null });
});

test("isCostLineCharged treats only explicit false as uncharged", () => {
  assert.equal(isCostLineCharged({ charged: false }), false);
  assert.equal(isCostLineCharged({ charged: true }), true);
  assert.equal(isCostLineCharged({}), true);
});
