import { test } from "node:test";
import assert from "node:assert/strict";
import type { HttpClient } from "../src/http.js";
import { ResponsesResource } from "../src/resources/responses.js";

interface Call {
  path: string;
  body: unknown;
}

function fakeHttp(calls: Call[], reply: unknown): HttpClient {
  return {
    post: async (path: string, body: unknown) => {
      calls.push({ path, body });
      return reply;
    },
  } as unknown as HttpClient;
}

test("inputTokens posts to /v1/responses/input_tokens", async () => {
  const calls: Call[] = [];
  const resource = new ResponsesResource(
    fakeHttp(calls, { object: "response.input_tokens", input_tokens: 12 }),
  );

  const result = await resource.inputTokens({
    model: "openai/o4-mini",
    input: "Explain the halting problem simply.",
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.path, "/v1/responses/input_tokens");
  assert.deepEqual(calls[0]?.body, {
    model: "openai/o4-mini",
    input: "Explain the halting problem simply.",
  });
  assert.equal(result.input_tokens, 12);
});

test("inputTokens drops a stray stream flag from the body", async () => {
  const calls: Call[] = [];
  const resource = new ResponsesResource(fakeHttp(calls, { input_tokens: 3 }));

  await resource.inputTokens({
    model: "openai/o4-mini",
    input: "hi",
    stream: true,
  } as never);

  const body = calls[0]?.body as Record<string, unknown>;
  assert.equal("stream" in body, false);
});
