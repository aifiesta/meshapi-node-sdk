/**
 * Contract tests — verify SDK types correctly round-trip all documented API
 * response shapes. Uses golden JSON fixtures shared with the Go and Java SDKs.
 * No live server required.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

import type {
  ChatCompletionResponse,
  ChatCompletionChunk,
  ModelInfo,
  TemplateSummary,
} from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function fixture(name: string): unknown {
  const raw = readFileSync(join(__dirname, "fixtures", name), "utf8");
  return JSON.parse(raw);
}

// ── Chat completion response ──────────────────────────────────────────────────

describe("contract: ChatCompletionResponse", () => {
  const data = fixture("chat_completion_response.json") as ChatCompletionResponse;

  it("parses id and model", () => {
    assert.equal(data.id, "chatcmpl-abc123");
    assert.equal(data.model, "openai/gpt-4o-mini");
  });

  it("parses choices array", () => {
    assert.equal(data.choices.length, 1);
    assert.equal(data.choices[0].message?.role, "assistant");
    assert.equal(data.choices[0].message?.content, "2 + 2 equals 4.");
    assert.equal(data.choices[0].finish_reason, "stop");
  });

  it("parses usage tokens", () => {
    assert.ok(data.usage != null);
    assert.equal(data.usage!.total_tokens, 21);
    assert.equal(data.usage!.prompt_tokens, 14);
    assert.equal(data.usage!.completion_tokens, 7);
  });
});

// ── Chat completion chunk ─────────────────────────────────────────────────────

describe("contract: ChatCompletionChunk", () => {
  const data = fixture("chat_completion_chunk.json") as ChatCompletionChunk;

  it("parses id and model", () => {
    assert.equal(data.id, "chatcmpl-abc123");
    assert.equal(data.model, "openai/gpt-4o-mini");
  });

  it("parses delta content", () => {
    assert.equal(data.choices.length, 1);
    assert.ok(data.choices[0].delta != null);
    assert.equal(data.choices[0].delta!.content, "Hello");
  });

  it("finish_reason is null for non-final chunks", () => {
    assert.equal(data.choices[0].finish_reason, null);
  });
});

// ── Model list ────────────────────────────────────────────────────────────────

describe("contract: ModelInfo[]", () => {
  const data = fixture("model_list.json") as ModelInfo[];

  it("parses array of models", () => {
    assert.equal(data.length, 2);
  });

  it("correctly identifies free vs paid", () => {
    const free = data.filter(m => m.is_free);
    const paid = data.filter(m => !m.is_free);
    assert.equal(free.length, 1);
    assert.equal(paid.length, 1);
  });

  it("models have required fields", () => {
    for (const m of data) {
      assert.ok(m.id, "model should have an id");
      assert.ok(m.name, "model should have a name");
      assert.ok(typeof m.is_free === "boolean", "is_free should be boolean");
    }
  });
});

// ── Template summary ──────────────────────────────────────────────────────────

describe("contract: TemplateSummary", () => {
  const data = fixture("template_summary.json") as TemplateSummary;

  it("parses id and name", () => {
    assert.equal(data.id, "550e8400-e29b-41d4-a716-446655440000");
    assert.equal(data.name, "pirate-assistant");
  });

  it("parses system prompt", () => {
    assert.equal(data.system, "You are a helpful assistant who speaks like a pirate.");
  });

  it("parses variables array", () => {
    assert.deepEqual(data.variables, ["topic"]);
  });
});
