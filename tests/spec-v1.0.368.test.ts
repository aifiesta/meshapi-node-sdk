import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isTokenCostLine,
  type ChatCompletionRequestAdditions,
  type AnthropicMessagesRequestAdditions,
  type CostLineOut,
  type CostBreakdownOutAdditions,
  type UsageFilterAdditions,
} from '../src/spec-v1.0.368.js';

test('chat request accepts max_completion_tokens and provider', () => {
  const body: ChatCompletionRequestAdditions = {
    max_completion_tokens: 256,
    provider: 'openai',
  };
  assert.deepEqual(JSON.parse(JSON.stringify(body)), {
    max_completion_tokens: 256,
    provider: 'openai',
  });
});

test('messages request accepts container, mcp_servers, service_tier', () => {
  const body: AnthropicMessagesRequestAdditions = {
    container: 'ctr_1',
    mcp_servers: [{ type: 'url', name: 'docs', url: 'https://example.com/mcp' }],
    service_tier: 'auto',
    provider: 'anthropic',
  };
  assert.equal(body.mcp_servers?.length, 1);
});

test('token cost line is detected', () => {
  const line: CostLineOut = { tokens: 1200, rate_per_1m_usd: '0.15' };
  assert.equal(isTokenCostLine(line), true);
});

test('non-token cost line has null tokens and a unit', () => {
  const line: CostLineOut = {
    tokens: null,
    rate_per_1m_usd: null,
    quantity: 2,
    unit: 'image',
    rate_usd: '0.04',
    charged: true,
    modifiers: [],
  };
  assert.equal(isTokenCostLine(line), false);
  assert.equal(line.unit, 'image');
});

test('cost line without tokens field is not a token line', () => {
  assert.equal(isTokenCostLine({ unit: 'second', quantity: 5 }), false);
});

test('breakdown carries rounding_usd', () => {
  const b: CostBreakdownOutAdditions = { rounding_usd: '0.0000001' };
  assert.equal(b.rounding_usd, '0.0000001');
});

test('usage filter accepts the new drill-through fields', () => {
  const f: UsageFilterAdditions = {
    provider: ['openai'],
    is_byok: false,
    stream: true,
    is_retry_attempt: [true, false],
  };
  assert.deepEqual(f.is_retry_attempt, [true, false]);
});
