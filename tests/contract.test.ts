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
  DocumentResponse,
  DocumentListResponse,
  TranscriptionResponse,
  AudioTranslationsParams,
  ChatCompletionParams,
  ResponsesParams,
  CreateTemplateParams,
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

// ── Document response ─────────────────────────────────────────────────────────

describe("contract: DocumentResponse", () => {
  const data = fixture("document_response.json") as DocumentResponse;

  it("parses required fields", () => {
    assert.equal(data.document_id, "doc_01JXXXXXXXXXXXXXXXXXXXXXXXXX");
    assert.equal(data.status, "completed");
    assert.equal(data.format, "pdf");
    assert.equal(data.model, "google/gemini-2.5-flash-lite");
  });

  it("parses optional token counts", () => {
    assert.equal(data.prompt_tokens, 120);
    assert.equal(data.completion_tokens, 4800);
    assert.equal(data.total_tokens, 4920);
  });

  it("parses nullable fields as null", () => {
    assert.equal(data.failure_reason, null);
  });

  it("parses download_url and title", () => {
    assert.ok(typeof data.download_url === "string");
    assert.ok(typeof data.title === "string");
  });
});

// ── Document list response ────────────────────────────────────────────────────

describe("contract: DocumentListResponse", () => {
  const data = fixture("document_list_response.json") as DocumentListResponse;

  it("parses pagination fields", () => {
    assert.equal(data.total, 2);
    assert.equal(data.limit, 50);
    assert.equal(data.offset, 0);
  });

  it("parses documents array", () => {
    assert.equal(data.documents.length, 2);
  });

  it("first document is completed", () => {
    assert.equal(data.documents[0]?.status, "completed");
  });

  it("second document has null nullable fields", () => {
    assert.equal(data.documents[1]?.title, null);
    assert.equal(data.documents[1]?.download_url, null);
    assert.equal(data.documents[1]?.size_bytes, null);
  });
});

// ── Audio translation response ─────────────────────────────────────────────────

describe("contract: TranscriptionResponse (audio/translations)", () => {
  const data = fixture("audio_translation_response.json") as TranscriptionResponse;

  it("parses text field", () => {
    assert.ok(typeof data.text === "string");
    assert.ok(data.text.length > 0);
  });
});

// ── AudioTranslationsParams type shape (compile-time contract) ────────────────

describe("contract: AudioTranslationsParams type", () => {
  it("model is required, others optional/nullable", () => {
    // Compile-time checks — if types.ts is wrong these lines will fail `npm run build`.
    const minimal: AudioTranslationsParams = { model: "openai/whisper-1" };
    assert.equal(minimal.model, "openai/whisper-1");

    const full: AudioTranslationsParams = {
      model: "openai/whisper-1",
      prompt: "Optional context hint",
      response_format: "json",
      temperature: 0.2,
    };
    assert.equal(full.temperature, 0.2);

    const withNulls: AudioTranslationsParams = {
      model: "openai/whisper-1",
      prompt: null,
      response_format: null,
      temperature: null,
    };
    assert.equal(withNulls.prompt, null);
  });
});

// ── ChatCompletionParams cache field ─────────────────────────────────────────

describe("contract: ChatCompletionParams cache field", () => {
  it("accepts cache as boolean or null", () => {
    const withCache: ChatCompletionParams = {
      messages: [{ role: "user", content: "hi" }],
      cache: true,
    };
    assert.equal(withCache.cache, true);

    const withoutCache: ChatCompletionParams = {
      messages: [{ role: "user", content: "hi" }],
    };
    assert.equal(withoutCache.cache, undefined);

    const nullCache: ChatCompletionParams = {
      messages: [{ role: "user", content: "hi" }],
      cache: null,
    };
    assert.equal(nullCache.cache, null);
  });
});

// ── ResponsesParams missing fields ────────────────────────────────────────────

describe("contract: ResponsesParams new fields", () => {
  it("accepts all 9 new spec fields", () => {
    const params: ResponsesParams = {
      input: "hello",
      previous_response_id: "resp_abc",
      instructions: "Be concise.",
      thinking: { type: "enabled", budget_tokens: 1024 },
      caching: { type: "ephemeral" },
      store: true,
      include: ["usage"],
      expire_at: 1900000000,
      max_tool_calls: 5,
      context_management: { type: "auto" },
    };
    assert.equal(params.previous_response_id, "resp_abc");
    assert.equal(params.instructions, "Be concise.");
    assert.equal(params.store, true);
    assert.equal(params.max_tool_calls, 5);
    assert.equal(params.expire_at, 1900000000);
    assert.deepEqual(params.include, ["usage"]);
    assert.deepEqual(params.thinking, { type: "enabled", budget_tokens: 1024 });
    assert.deepEqual(params.caching, { type: "ephemeral" });
    assert.deepEqual(params.context_management, { type: "auto" });
  });

  it("all new fields accept null", () => {
    const params: ResponsesParams = {
      input: "hello",
      previous_response_id: null,
      instructions: null,
      thinking: null,
      caching: null,
      store: null,
      include: null,
      expire_at: null,
      max_tool_calls: null,
      context_management: null,
    };
    assert.equal(params.previous_response_id, null);
    assert.equal(params.store, null);
  });
});

// ── CreateTemplateParams team_id field ────────────────────────────────────────

describe("contract: CreateTemplateParams team_id", () => {
  it("accepts team_id as string or null", () => {
    const withTeam: CreateTemplateParams = {
      name: "my-template",
      team_id: "team_01JXXXXXXXXXX",
    };
    assert.equal(withTeam.team_id, "team_01JXXXXXXXXXX");

    const nullTeam: CreateTemplateParams = {
      name: "my-template",
      team_id: null,
    };
    assert.equal(nullTeam.team_id, null);

    const noTeam: CreateTemplateParams = { name: "my-template" };
    assert.equal(noTeam.team_id, undefined);
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
