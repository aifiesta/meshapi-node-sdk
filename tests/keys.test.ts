import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KeysResource } from '../src/resources/keys';

function fakeHttp(response: unknown) {
  const calls: string[] = [];
  const http = {
    async get<T>(path: string): Promise<T> {
      calls.push(path);
      return response as T;
    },
  };
  return { http, calls };
}

test('keys.retrieve calls GET /v1/keys/{key_id}', async () => {
  const payload = {
    id: 'key_123',
    org_id: 'org_1',
    label: 'ci',
    masked_key: 'rsk_...abcd',
    scopes: ['inference'],
    allowed_models: ['openai/gpt-4o-mini'],
    blocked_models: [],
    model_limits: {},
    limits: {},
  };
  const { http, calls } = fakeHttp(payload);
  const keys = new KeysResource(http as any);
  const result = await keys.retrieve('key_123');
  assert.deepEqual(calls, ['/v1/keys/key_123']);
  assert.equal(result.id, 'key_123');
  assert.deepEqual(result.allowed_models, ['openai/gpt-4o-mini']);
  assert.equal((result as Record<string, unknown>).secret, undefined);
});

test('keys.retrieve encodes the key id', async () => {
  const { http, calls } = fakeHttp({ id: 'a/b' });
  const keys = new KeysResource(http as any);
  await keys.retrieve('a/b');
  assert.deepEqual(calls, ['/v1/keys/a%2Fb']);
});

test('keys.retrieve rejects an empty key id', async () => {
  const { http, calls } = fakeHttp({});
  const keys = new KeysResource(http as any);
  await assert.rejects(() => keys.retrieve(''), /keyId is required/);
  assert.equal(calls.length, 0);
});
