/**
 * Unit tests for chat.completions.parse() — Zod (Standard Schema) + raw JSON
 * schema paths, opt-in retry, and StructuredOutputError with the model-support
 * hint. HttpClient is mocked; no network.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { ChatCompletionsResource } from "../src/resources/chat.js";
import { StructuredOutputError } from "../src/errors.js";
import { buildResponseFormat } from "../src/structured.js";

const Country = z.object({ country: z.string(), capital: z.string() });

function payload(content: string) {
  return {
    id: "c1",
    object: "chat.completion",
    created: 0,
    model: "m",
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
  };
}

// Mock HttpClient: returns queued payloads in order; records each call.
function mockHttp(queue: unknown[]) {
  const calls: Array<{ path: string; body: any }> = [];
  const http = {
    post: async (path: string, body: unknown) => {
      calls.push({ path, body: body as any });
      if (queue.length === 0) throw new Error("no more mock responses");
      return queue.shift();
    },
  };
  return { http: http as any, calls };
}

const PARAMS = {
  model: "openai/gpt-4o-mini",
  messages: [{ role: "user" as const, content: "Give me facts about France." }],
};

describe("chat.completions.parse — Zod", () => {
  it("returns a validated, typed object and sends a json_schema response_format", async () => {
    const { http, calls } = mockHttp([
      payload(JSON.stringify({ country: "France", capital: "Paris" })),
    ]);
    const res = new ChatCompletionsResource(http);
    const out = await res.parse(PARAMS, Country);
    assert.equal(out.capital, "Paris");
    assert.equal(out.country, "France");

    const body = calls[0].body;
    assert.equal(body.stream, false);
    assert.equal(body.response_format.type, "json_schema");
    assert.ok(body.response_format.json_schema.schema.properties.capital);
  });

  it("throws StructuredOutputError (shape mismatch) when JSON is valid but wrong", async () => {
    const { http } = mockHttp([payload(JSON.stringify({ country: "France" }))]); // missing capital
    const res = new ChatCompletionsResource(http);
    await assert.rejects(
      () => res.parse(PARAMS, Country),
      (e: unknown) =>
        e instanceof StructuredOutputError &&
        /did not match the requested schema/.test(e.message),
    );
  });

  it("prose (non-JSON) -> StructuredOutputError hints at model support + Models link", async () => {
    const { http } = mockHttp([payload("Sure! The capital of France is Paris.")]);
    const res = new ChatCompletionsResource(http);
    await assert.rejects(
      () => res.parse(PARAMS, Country),
      (e: unknown) =>
        e instanceof StructuredOutputError &&
        /does not support structured outputs/.test(e.message) &&
        e.message.includes("app.meshapi.ai") &&
        e.message.includes("/models") &&
        e.errorCode === "structured_output_parse_error",
    );
  });

  it("maxRetries recovers and appends a correction turn", async () => {
    const { http, calls } = mockHttp([
      payload(JSON.stringify({ country: "France" })), // bad
      payload(JSON.stringify({ country: "France", capital: "Paris" })), // good
    ]);
    const res = new ChatCompletionsResource(http);
    const out = await res.parse(PARAMS, Country, { maxRetries: 1 });
    assert.equal(out.capital, "Paris");
    assert.equal(calls.length, 2);
    const roles = calls[1].body.messages.map((m: any) => m.role);
    assert.deepEqual(roles, ["user", "assistant", "user"]);
  });

  it("default maxRetries is 0 (single call)", async () => {
    const { http, calls } = mockHttp([payload(JSON.stringify({ country: "France" }))]);
    const res = new ChatCompletionsResource(http);
    await assert.rejects(() => res.parse(PARAMS, Country));
    assert.equal(calls.length, 1);
  });
});

describe("chat.completions.parse — raw JSON schema", () => {
  it("returns JSON.parse'd data (no validation) and forwards the schema name", async () => {
    const { http, calls } = mockHttp([payload(JSON.stringify({ anything: 1 }))]);
    const res = new ChatCompletionsResource(http);
    const out = await res.parse<{ anything: number }>(PARAMS, {
      name: "custom",
      schema: { type: "object", properties: { anything: { type: "number" } } },
    });
    assert.equal(out.anything, 1);
    assert.equal(calls[0].body.response_format.json_schema.name, "custom");
  });

  it("prose -> StructuredOutputError with the model-support hint (JSON parse fails)", async () => {
    const { http } = mockHttp([payload("not json at all")]);
    const res = new ChatCompletionsResource(http);
    await assert.rejects(
      () => res.parse(PARAMS, { type: "object" }),
      (e: unknown) =>
        e instanceof StructuredOutputError &&
        /does not support structured outputs/.test(e.message) &&
        (e as { cause?: unknown }).cause instanceof SyntaxError,
    );
  });

  it("passes a full response_format wrapper through unchanged", async () => {
    const { http, calls } = mockHttp([payload(JSON.stringify({ ok: true }))]);
    const res = new ChatCompletionsResource(http);
    const wrapper = {
      type: "json_schema",
      json_schema: { name: "w", schema: { type: "object" } },
    };
    await res.parse(PARAMS, wrapper);
    assert.deepEqual(calls[0].body.response_format, wrapper);
  });
});

describe("chat.completions.parse — non-Zod Standard Schema validators", () => {
  // Minimal fake of an ArkType-style validator: passes isStandardSchema() and
  // exposes its own JSON-schema converter.
  const arktypeLike = {
    "~standard": {
      version: 1,
      vendor: "arktype",
      validate: (value: unknown) => ({ value }),
    },
    toJsonSchema: () => ({
      type: "object",
      properties: { x: { type: "number" } },
      required: ["x"],
    }),
  };

  it("uses a validator-provided toJsonSchema() to build the wire schema", async () => {
    const rf = await buildResponseFormat(arktypeLike);
    assert.equal(rf.type, "json_schema");
    const js = rf.json_schema as { schema: { properties: Record<string, unknown> } };
    assert.ok(js.schema.properties.x);
  });

  it("throws a clear, vendor-named error for validators without a converter", async () => {
    const valibotLike = {
      "~standard": {
        version: 1,
        vendor: "valibot",
        validate: (value: unknown) => ({ value }),
      },
    };
    await assert.rejects(
      () => buildResponseFormat(valibotLike),
      (e: unknown) =>
        e instanceof Error &&
        e.message.includes("valibot") &&
        /pass a raw JSON schema `\{ name, schema \}`/i.test(e.message),
    );
  });
});

describe("chat.completions.parse — maxRetries validation", () => {
  for (const bad of [Infinity, NaN, -1, 1.5]) {
    it(`rejects maxRetries: ${bad} with RangeError`, async () => {
      const { http, calls } = mockHttp([]); // guard fires before any HTTP call
      const res = new ChatCompletionsResource(http);
      await assert.rejects(
        () => res.parse(PARAMS, Country, { maxRetries: bad }),
        (e: unknown) =>
          e instanceof RangeError && /non-negative safe integer/.test(e.message),
      );
      assert.equal(calls.length, 0);
    });
  }
});

describe("chat.completions.parse — empty content", () => {
  it("empty content -> StructuredOutputError mentioning no text content, not lack of support", async () => {
    const { http } = mockHttp([payload("")]);
    const res = new ChatCompletionsResource(http);
    await assert.rejects(
      () => res.parse(PARAMS, Country),
      (e: unknown) =>
        e instanceof StructuredOutputError &&
        /no text content/.test(e.message) &&
        !/does not support structured outputs/.test(e.message),
    );
  });
});
