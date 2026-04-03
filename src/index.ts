import { HttpClient } from "./http.js";
import type { MeshAPIConfig } from "./http.js";
import { ChatResource } from "./resources/chat.js";
import { ModelsResource } from "./resources/models.js";
import { TemplatesResource } from "./resources/templates.js";

// ── Main client ───────────────────────────────────────────────────────────────

/**
 * MeshAPI SDK client.
 *
 * One instance = one auth realm. Create separate instances for different
 * authentication contexts (data-plane vs. control-plane vs. admin).
 *
 * @example
 * ```ts
 * import { MeshAPI } from "meshapi-node-sdk";
 *
 * // Data-plane client (rsk_ key) — for chat completions
 * const client = new MeshAPI({
 *   baseUrl: "https://api.yourdomain.com",
 *   token: "rsk_01JXXXXXXXXXXXXXXXXXXXXXXXXX",
 * });
 *
 * // Control-plane client (Supabase JWT) — for templates & models
 * const ctrlClient = new MeshAPI({
 *   baseUrl: "https://api.yourdomain.com",
 *   token: supabaseSession.access_token,
 * });
 * ```
 */
export class MeshAPI {
  /**
   * Chat completions namespace.
   * Requires a data-plane API key (`rsk_...`).
   *
   * @example
   * ```ts
   * const response = await client.chat.completions.create({
   *   model: "openai/gpt-4o-mini",
   *   messages: [{ role: "user", content: "Hello!" }],
   * });
   * ```
   */
  readonly chat: ChatResource;

  /**
   * Models namespace.
   * Accepts either a data-plane API key or a Supabase JWT.
   *
   * @example
   * ```ts
   * const models = await client.models.list();
   * ```
   */
  readonly models: ModelsResource;

  /**
   * Templates namespace.
   * Accepts either a data-plane API key or a Supabase JWT.
   *
   * @example
   * ```ts
   * const template = await client.templates.create({ name: "my-template", system: "..." });
   * ```
   */
  readonly templates: TemplatesResource;

  constructor(config: MeshAPIConfig) {
    const http = new HttpClient(config);
    this.chat = new ChatResource(http);
    this.models = new ModelsResource(http);
    this.templates = new TemplatesResource(http);
  }
}

// ── Re-exports ────────────────────────────────────────────────────────────────

export { MeshAPIApiError } from "./errors.js";
export type { MeshAPIConfig } from "./http.js";

export type {
  // Shared
  RequestOptions,

  // Chat
  ChatRole,
  ChatMessage,
  ChatCompletionParams,
  ChatCompletionResponse,
  ChatCompletionChoice,
  ChatCompletionMessage,
  ChatCompletionChunk,
  ChatCompletionChunkChoice,
  ChatCompletionChunkDelta,
  ContentPart,
  ContentPartText,
  ContentPartImage,
  ImageUrl,
  Tool,
  ToolCall,
  ToolCallFunction,
  ToolChoice,
  ToolFunction,
  UsageInfo,

  // Models
  ModelInfo,
  ModelPricing,
  ListModelsParams,

  // Templates
  TemplateSummary,
  CreateTemplateParams,
  UpdateTemplateParams,
  TemplateMessage,

  // Errors (wire types)
  ApiErrorBody,
  ApiErrorEnvelope,
} from "./types.js";
