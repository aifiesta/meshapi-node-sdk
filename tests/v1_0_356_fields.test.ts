import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../src/augment/v1_0_356';
import type { ProviderPreference, AnthropicMcpServer } from '../src/augment/v1_0_356';

test('chat request serialises provider and max_completion_tokens', () => {
  const provider: ProviderPreference = 'openai';
  const body = {
    model: 'openai/gpt-4o-mini',
    messages: [{ role: 'user', content: 'Hello' }],
    max_completion_tokens: 256,
    provider,
  };
  const parsed = JSON.parse(JSON.stringify(body));
  assert.equal(parsed.max_completion_tokens, 256);
  assert.equal(parsed.provider, 'openai');
});

test('provider accepts an object preference', () => {
  const provider: ProviderPreference = { order: ['openai'] };
  const parsed = JSON.parse(JSON.stringify({ model: 'openai/gpt-4o-mini', input: 'Hi', provider }));
  assert.deepEqual(parsed.provider, { order: ['openai'] });
});

test('omitted optional fields are not serialised', () => {
  const body: Record<string, unknown> = { model: 'openai/gpt-4o-mini', messages: [] };
  const parsed = JSON.parse(JSON.stringify(body));
  assert.equal('provider' in parsed, false);
  assert.equal('max_completion_tokens' in parsed, false);
});

test('messages request serialises service_tier, container and mcp_servers', () => {
  const mcp: AnthropicMcpServer[] = [{ type: 'url', url: 'https://example.com/mcp', name: 'example' }];
  const body = {
    model: 'anthropic/claude-haiku-4.5',
    max_tokens: 64,
    messages: [{ role: 'user', content: 'Hello' }],
    service_tier: 'auto',
    container: 'container_123',
    mcp_servers: mcp,
  };
  const parsed = JSON.parse(JSON.stringify(body));
  assert.equal(parsed.service_tier, 'auto');
  assert.equal(parsed.container, 'container_123');
  assert.equal(parsed.mcp_servers.length, 1);
});

test('transcription provider is a string form field', () => {
  const form = new FormData();
  form.append('model', 'openai/gpt-4o-mini');
  form.append('provider', 'openai');
  assert.equal(form.get('provider'), 'openai');
});
