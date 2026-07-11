import { StructuredOutputError } from "../errors.js";
import { makeLazySSEIterable } from "../http.js";
import type { HttpClient } from "../http.js";
import {
  buildResponseFormat,
  correctionPrompt,
  extractContent,
  structuredOutputErrorMessage,
  tryParse,
} from "../structured.js";
import type {
  JsonSchemaInput,
  StandardSchemaV1,
  StructuredParseOptions,
} from "../structured.js";
import type {
  ChatCompletionChunk,
  ChatCompletionParams,
  ChatCompletionResponse,
  RequestOptions,
} from "../types.js";

// ── Completions sub-resource ──────────────────────────────────────────────────

export class ChatCompletionsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Create a chat completion (non-streaming).
   *
   * Auth: API key (`rsk_...`)
   *
   * @example
   * ```ts
   * const response = await client.chat.completions.create({
   *   model: "openai/gpt-4o-mini",
   *   messages: [{ role: "user", content: "Hello!" }],
   * });
   * console.log(response.choices[0]?.message.content);
   * ```
   */
  create(
    params: ChatCompletionParams & { stream?: false },
    opts?: RequestOptions,
  ): Promise<ChatCompletionResponse>;

  /**
   * Create a chat completion (streaming).
   *
   * Auth: API key (`rsk_...`)
   *
   * Returns an `AsyncIterable<ChatCompletionChunk>` that yields SSE frames
   * as they arrive. Throws `MeshAPIApiError` on mid-stream error frames.
   *
   * @example
   * ```ts
   * const stream = client.chat.completions.create({
   *   model: "openai/gpt-4o-mini",
   *   messages: [{ role: "user", content: "Tell me a story." }],
   *   stream: true,
   * });
   *
   * for await (const chunk of stream) {
   *   const text = chunk.choices[0]?.delta.content ?? "";
   *   process.stdout.write(text);
   * }
   * ```
   */
  create(
    params: ChatCompletionParams & { stream: true },
    opts?: RequestOptions,
  ): AsyncIterable<ChatCompletionChunk>;

  create(
    params: ChatCompletionParams,
    opts?: RequestOptions,
  ): Promise<ChatCompletionResponse> | AsyncIterable<ChatCompletionChunk>;

  create(
    params: ChatCompletionParams,
    opts?: RequestOptions,
  ): Promise<ChatCompletionResponse> | AsyncIterable<ChatCompletionChunk> {
    if (params.stream === true) {
      return this.streamCreate(params, opts);
    }
    return this.http.post<ChatCompletionResponse>("/v1/chat/completions", params, opts);
  }

  private streamCreate(
    params: ChatCompletionParams,
    opts?: RequestOptions,
  ): AsyncIterable<ChatCompletionChunk> {
    return makeLazySSEIterable(this.http, "/v1/chat/completions", params, opts);
  }

  /**
   * Structured (JSON-schema-constrained) completion. Non-streaming.
   *
   * Pass a **Standard Schema** validator (Zod v3.24+, Valibot, ArkType — Zod
   * needs v4 for JSON-schema derivation) to get a runtime-validated, typed
   * result, or a raw JSON schema object (returned via `JSON.parse`, unvalidated;
   * use the `<T>` type parameter for typing). With `opts.maxRetries > 0`, a
   * response that fails validation is fed back to the model with the error
   * appended. Throws {@link StructuredOutputError} if it still can't be parsed —
   * most often because the model doesn't support structured outputs.
   *
   * @example
   * ```ts
   * import { z } from "zod";
   * const Country = z.object({ country: z.string(), capital: z.string() });
   * const c = await client.chat.completions.parse(params, Country);
   * console.log(c.capital); // typed + validated
   * ```
   */
  parse<S extends StandardSchemaV1>(
    params: ChatCompletionParams,
    schema: S,
    opts?: StructuredParseOptions,
  ): Promise<StandardSchemaV1.InferOutput<S>>;
  parse<T = unknown>(
    params: ChatCompletionParams,
    schema: JsonSchemaInput,
    opts?: StructuredParseOptions,
  ): Promise<T>;
  async parse(
    params: ChatCompletionParams,
    schema: unknown,
    opts?: StructuredParseOptions,
  ): Promise<unknown> {
    const maxRetries = opts?.maxRetries ?? 0;
    let httpOpts: RequestOptions | undefined;
    if (opts && (opts.signal !== undefined || opts.timeoutMs !== undefined)) {
      httpOpts = {};
      if (opts.signal !== undefined) httpOpts.signal = opts.signal;
      if (opts.timeoutMs !== undefined) httpOpts.timeoutMs = opts.timeoutMs;
    }

    const responseFormat = await buildResponseFormat(schema);
    const body: Record<string, unknown> = {
      ...params,
      stream: false,
      response_format: responseFormat,
    };

    let attempt = 0;
    for (;;) {
      const resp = await this.http.post<ChatCompletionResponse>(
        "/v1/chat/completions",
        body,
        httpOpts,
      );
      const content = extractContent(resp);
      const outcome = await tryParse(schema, content);
      if (outcome.ok) return outcome.value;
      if (attempt >= maxRetries) {
        throw new StructuredOutputError(
          structuredOutputErrorMessage(params.model, outcome.notJson, outcome.error),
          { cause: outcome.error },
        );
      }
      attempt += 1;
      body.messages = [
        ...(body.messages as unknown[]),
        { role: "assistant", content },
        { role: "user", content: correctionPrompt(outcome.error) },
      ];
    }
  }
}

// ── Chat namespace ────────────────────────────────────────────────────────────

export class ChatResource {
  readonly completions: ChatCompletionsResource;

  constructor(http: HttpClient) {
    this.completions = new ChatCompletionsResource(http);
  }
}
