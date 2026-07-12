/**
 * Structured-output helpers for `chat.completions.parse()`.
 *
 * Two schema inputs:
 *   1. A **Standard Schema** validator (Zod v3.24+, Valibot, ArkType, …) — used
 *      for runtime validation + output typing. JSON-schema derivation for the
 *      wire: Zod via v4 `z.toJSONSchema`, Valibot via `@valibot/to-json-schema`
 *      (both dynamic-imported optional peers, so the base SDK stays
 *      dependency-free), any other vendor via its own `toJsonSchema()` method
 *      (e.g. ArkType).
 *   2. A raw **JSON schema** object — sent as-is, returned via `JSON.parse`
 *      (no runtime validation).
 *
 * The gateway forwards `response_format` to each provider; the SDK only builds
 * the request field and parses the reply.
 */
import type { ChatCompletionResponse } from "./types.js";

// ── Standard Schema spec (vendored — https://standardschema.dev, MIT) ──────────
// Copied locally so the SDK depends on no validation library. Zod, Valibot and
// ArkType all implement this interface, so any of them works with no import.

export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly "~standard": StandardSchemaV1.Props<Input, Output>;
}

export namespace StandardSchemaV1 {
  export interface Props<Input = unknown, Output = Input> {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (
      value: unknown,
    ) => Result<Output> | Promise<Result<Output>>;
    readonly types?: Types<Input, Output> | undefined;
  }
  export type Result<Output> = SuccessResult<Output> | FailureResult;
  export interface SuccessResult<Output> {
    readonly value: Output;
    readonly issues?: undefined;
  }
  export interface FailureResult {
    readonly issues: ReadonlyArray<Issue>;
  }
  export interface Issue {
    readonly message: string;
    readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined;
  }
  export interface PathSegment {
    readonly key: PropertyKey;
  }
  export interface Types<Input = unknown, Output = Input> {
    readonly input: Input;
    readonly output: Output;
  }
  export type InferOutput<Schema extends StandardSchemaV1> = NonNullable<
    Schema["~standard"]["types"]
  >["output"];
}

/** A raw JSON schema: a full `response_format` wrapper, `{ name, schema }`, or a bare schema. */
export type JsonSchemaInput = Record<string, unknown>;

/** Options for `parse()` — `maxRetries` plus any per-request HTTP options. */
export interface StructuredParseOptions {
  /** Re-prompt with the validation error up to this many times (default 0). */
  maxRetries?: number;
  /** Per-request AbortSignal to cancel the request. */
  signal?: AbortSignal;
  /** Per-request timeout override in milliseconds. */
  timeoutMs?: number;
}

export type ParseOutcome =
  | { ok: true; value: unknown }
  | { ok: false; notJson: boolean; error: unknown };

export const MODELS_URL = "https://app.meshapi.ai/org/<your-org-id>/models";

export function isStandardSchema(x: unknown): x is StandardSchemaV1 {
  return (
    typeof x === "object" &&
    x !== null &&
    "~standard" in x &&
    typeof (x as StandardSchemaV1)["~standard"]?.validate === "function"
  );
}

/** Derive the wire JSON schema from a Standard Schema (Zod, Valibot, or any vendor exposing `toJsonSchema()`). */
async function toJsonSchema(schema: StandardSchemaV1): Promise<Record<string, unknown>> {
  const vendor = schema["~standard"].vendor;
  if (vendor === "zod") {
    let zod: Record<string, unknown>;
    try {
      zod = (await import("zod")) as unknown as Record<string, unknown>;
    } catch {
      throw new Error(
        "A Zod schema was passed but `zod` is not installed. Install zod (v4), or pass a raw JSON schema `{ name, schema }`.",
      );
    }
    const fn =
      (zod.toJSONSchema as unknown) ??
      ((zod.z as Record<string, unknown> | undefined)?.toJSONSchema as unknown) ??
      ((zod.default as Record<string, unknown> | undefined)?.toJSONSchema as unknown);
    if (typeof fn !== "function") {
      throw new Error(
        "Deriving a JSON schema from a Zod schema requires zod v4's `z.toJSONSchema`. Upgrade zod to v4, or pass a raw JSON schema `{ name, schema }`.",
      );
    }
    return (fn as (s: unknown) => Record<string, unknown>)(schema);
  }
  if (vendor === "valibot") {
    let mod: Record<string, unknown>;
    try {
      mod = (await import("@valibot/to-json-schema")) as unknown as Record<string, unknown>;
    } catch {
      throw new Error(
        "A Valibot schema was passed but `@valibot/to-json-schema` is not installed. " +
          "Install @valibot/to-json-schema, or pass a raw JSON schema `{ name, schema }`.",
      );
    }
    const fn =
      (mod.toJsonSchema as unknown) ??
      ((mod.default as Record<string, unknown> | undefined)?.toJsonSchema as unknown);
    if (typeof fn !== "function") {
      throw new Error(
        "`@valibot/to-json-schema` does not export `toJsonSchema`. Upgrade the package, " +
          "or pass a raw JSON schema `{ name, schema }`.",
      );
    }
    return (fn as (s: unknown) => Record<string, unknown>)(schema);
  }
  // Other Standard Schema validators may expose their own JSON-schema
  // converter — ArkType, for example, has `.toJsonSchema()`. Use it when
  // present so those validators work without a raw JSON schema.
  const converter =
    (schema as { toJsonSchema?: unknown }).toJsonSchema ??
    (schema as { toJSONSchema?: unknown }).toJSONSchema;
  if (typeof converter === "function") {
    return (converter as (this: unknown) => Record<string, unknown>).call(schema);
  }
  throw new Error(
    `Cannot derive a JSON schema from a "${vendor}" schema: it does not expose a ` +
      `\`toJsonSchema()\` method. Pass a raw JSON schema \`{ name, schema }\`, or use a ` +
      `Zod (v4) schema, a Valibot schema (with \`@valibot/to-json-schema\` installed), or ` +
      `another validator that exposes \`toJsonSchema()\` (e.g. ArkType).`,
  );
}

/** Build the OpenAI-style `response_format` request field. */
export async function buildResponseFormat(schema: unknown): Promise<Record<string, unknown>> {
  if (isStandardSchema(schema)) {
    const jsonSchema = await toJsonSchema(schema);
    const desc = (schema as { description?: unknown }).description;
    const name = typeof desc === "string" ? desc : "response";
    return { type: "json_schema", json_schema: { name, schema: jsonSchema } };
  }
  const rf = schema as Record<string, unknown>;
  if (rf.type === "json_schema" && rf.json_schema) return rf;
  if (rf.schema && typeof rf.schema === "object") {
    return {
      type: "json_schema",
      json_schema: { name: (rf.name as string) ?? "response", schema: rf.schema },
    };
  }
  return { type: "json_schema", json_schema: { name: "response", schema: rf } };
}

/** Parse + validate the model's reply. `notJson` distinguishes prose from a shape mismatch. */
export async function tryParse(schema: unknown, content: string): Promise<ParseOutcome> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    return { ok: false, notJson: true, error: e };
  }
  if (isStandardSchema(schema)) {
    const result = await schema["~standard"].validate(parsed);
    if (result.issues) return { ok: false, notJson: false, error: result.issues };
    return { ok: true, value: result.value };
  }
  return { ok: true, value: parsed }; // raw path — no runtime validation
}

export function extractContent(resp: ChatCompletionResponse): string {
  const content = resp.choices?.[0]?.message?.content;
  return typeof content === "string" ? content : "";
}

function errText(error: unknown): string {
  if (Array.isArray(error)) {
    return error
      .map((i) => {
        const seg = (i as StandardSchemaV1.Issue)?.path;
        const path = Array.isArray(seg)
          ? seg.map((p) => (typeof p === "object" && p !== null ? String(p.key) : String(p))).join(".")
          : "";
        const msg = (i as StandardSchemaV1.Issue)?.message ?? String(i);
        return path ? `${path}: ${msg}` : msg;
      })
      .join("; ");
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

export function correctionPrompt(error: unknown): string {
  return (
    `Your previous response failed schema validation: ${errText(error)}. ` +
    "Return ONLY a JSON object that matches the requested schema, with no prose, markdown, or code fences."
  );
}

export function structuredOutputErrorMessage(
  model: string | undefined,
  notJson: boolean,
  error: unknown,
  emptyContent = false,
): string {
  const where = model ? ` from model '${model}'` : "";
  if (emptyContent) {
    return (
      `Could not parse a structured response${where}: the model returned no text content ` +
      "(the message content was empty or null). This usually means the model produced a refusal " +
      "or a tool call rather than a JSON answer, not that it lacks structured-output support. " +
      "Remove any tools from the request if you expected JSON, check for a refusal, and confirm the " +
      `model supports structured outputs on the Models page (${MODELS_URL}). Original error: ${errText(error)}`
    );
  }
  if (notJson) {
    return (
      `Could not parse a structured response${where}: the model returned text that is not valid JSON, ` +
      "which usually means it does not support structured outputs (response_format). Check the model's " +
      `support on the Models page (${MODELS_URL}) or the \`supports_structured_output\` flag from ` +
      "GET /v1/models, and prefer a model with first-class support (e.g. openai/* or google/gemini-*). " +
      `Original error: ${errText(error)}`
    );
  }
  return (
    `Could not parse a structured response${where}: the response was valid JSON but did not match the ` +
    `requested schema. Retry with a higher \`maxRetries\`, or confirm the model supports structured ` +
    `outputs on the Models page (${MODELS_URL}). Original error: ${errText(error)}`
  );
}
