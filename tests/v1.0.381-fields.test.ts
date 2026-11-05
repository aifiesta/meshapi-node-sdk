import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ModelPricing, RouterSelectRequest } from '../src/index.js';

test('ModelPricing carries long_context_cache_write_1h_input_usd_per_1m', () => {
  const pricing: Partial<ModelPricing> = {
    long_context_cache_write_1h_input_usd_per_1m: 1,
  };
  const parsed = JSON.parse(JSON.stringify(pricing)) as Partial<ModelPricing>;
  assert.equal(parsed.long_context_cache_write_1h_input_usd_per_1m, 1);
});

test('ModelPricing accepts a null long-context 1h cache write price', () => {
  const pricing: Partial<ModelPricing> = {
    long_context_cache_write_1h_input_usd_per_1m: null,
  };
  const parsed = JSON.parse(JSON.stringify(pricing)) as Partial<ModelPricing>;
  assert.equal(parsed.long_context_cache_write_1h_input_usd_per_1m, null);
});

test('RouterSelectRequest serialises weight_profile', () => {
  const body: Partial<RouterSelectRequest> = { weight_profile: 'cost_first' };
  assert.equal(JSON.parse(JSON.stringify(body)).weight_profile, 'cost_first');
});

test('RouterSelectRequest omits weight_profile when unset', () => {
  const body: Partial<RouterSelectRequest> = {};
  assert.equal('weight_profile' in JSON.parse(JSON.stringify(body)), false);
});
