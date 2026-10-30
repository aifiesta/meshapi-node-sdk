import { test } from "node:test";
import assert from "node:assert/strict";
import type { HttpClient } from "../src/http.js";
import { ResponsesResource } from "../src/resources/responses.js";

interface Call {
  path: string;
  body: unknown;
  opts: unknown;
}

function fakeHttp(result: unknown): { http: HttpClient; calls: Call[] } {
  const calls: Call[] = [];
  const http = {
    post: async (path: string, body: unknown, opts?: unknown) => {
      calls.push({ path, body, opts });
      return result;
    },
    get: async () => {
      throw new Error("unexpected GET");
    },
  } as unknown as HttpClient;
  return { http, calls };
}

test("inputTokens posts to /v1/responses/input_tokens", async () => {
  const { http, calls } = fakeHttp({ object: "response.input_tokens", input_tokens: 12 });
  const res = new ResponsesResource(http);

  const out = await res.inputTokens({ model: "openai/o4-mini", input: "Hello" });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.path, "/v1/responses/input_tokens");
  assert.deepEqual(calls[0]!.body, { model: "openai/o4-mini", input: "Hello" });
  assert.equal(out.input_tokens, 12);
  assert.equal(out.object, "response.input_tokens");
});

test("inputTokens drops a stream flag from the body", async () => {
  const { http, calls } = fakeHttp({ input_tokens: 3 });
  const res = new ResponsesResource(http);

  await res.inputTokens({
    model: "openai/o4-mini",
    input: "Hi",
    ...({ stream: true } as Record<string, unknown>),
  } as never);

  assert.equal(Object.prototype.hasOwnProperty.call(calls[0]!.body, "stream"), false);
});

test("inputTokens forwards request options", async () => {
  const { http, calls } = fakeHttp({ input_tokens: 1 });
  const res = new ResponsesResource(http);
  const opts = { timeout: 5000 };

  await res.inputTokens({ model: "openai/o4-mini", input: "x" }, opts as never);

  assert.equal(calls[0]!.opts, opts);
});
