import { HttpClient } from "./http.js";
import type { MeshAPIConfig } from "./http.js";
import { ChatResource } from "./resources/chat.js";
import { CompareResource } from "./resources/compare.js";
import { EmbeddingsResource } from "./resources/embeddings.js";
import { BatchesResource } from "./resources/batches.js";
import { ModelsResource } from "./resources/models.js";
import { ResponsesResource } from "./resources/responses.js";
import { TemplatesResource } from "./resources/templates.js";
import { ImagesResource } from "./resources/images.js";
import { RagResource } from "./resources/rag.js";
import { RealtimeResource } from "./resources/realtime.js";
import { AudioResource } from "./resources/audio.js";
import { VideosResource } from "./resources/videos.js";
import { ModerationsResource } from "./resources/moderations.js";
import { WebResource } from "./resources/web-search.js";
import { RouterResource } from "./resources/router-select.js";
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
   * Responses namespace — higher-level inference for reasoning models.
   * Requires a data-plane API key (`rsk_...`).
   *
   * Uses `input` (string or message list) instead of `messages`, supports
   * `reasoning.effort` for chain-of-thought, and `max_output_tokens` instead
   * of `max_tokens`. Streaming uses the same SSE chunk format as chat/completions.
   *
   * @example
   * ```ts
   * const response = await client.responses.create({
   *   model: "openai/o4-mini",
   *   input: "Explain the halting problem simply.",
   *   reasoning: { effort: "medium" },
   * });
   * console.log(response.choices[0]?.message.content);
   * ```
   */
  readonly responses: ResponsesResource;
  readonly embeddings: EmbeddingsResource;
  readonly compare: CompareResource;
  readonly batches: BatchesResource;
  readonly images: ImagesResource;
  readonly rag: RagResource;

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

  /**
   * Realtime namespace — bidirectional WebSocket sessions (Speech-to-Speech).
   * Requires a data-plane API key (`rsk_...`) and a realtime-capable model.
   *
   * @example
   * ```ts
   * const session = await client.realtime.connect({ model: "openai/gpt-4o-realtime-preview" });
   * for await (const msg of session) {
   *   console.log(msg.event?.type);
   * }
   * ```
   */
  readonly realtime: RealtimeResource;
  readonly audio: AudioResource;
  readonly videos: VideosResource;

  /** Content moderation namespace — POST /v1/moderations. */
  readonly moderations: ModerationsResource;

  /** Web search namespace — POST /v1/web/search (gated by WEB_SEARCH_ENABLED). */
  readonly web: WebResource;

  /** Auto Router select-only namespace — POST /v1/router/select (gated by AUTO_ROUTER_ENABLED). */
  readonly router: RouterResource;

  constructor(config: MeshAPIConfig) {
    const http = new HttpClient(config);
    this.chat = new ChatResource(http);
    this.responses = new ResponsesResource(http);
    this.embeddings = new EmbeddingsResource(http);
    this.compare = new CompareResource(http);
    this.batches = new BatchesResource(http);
    this.models = new ModelsResource(http);
    this.templates = new TemplatesResource(http);
    this.images = new ImagesResource(http);
    this.rag = new RagResource(http);
    this.realtime = new RealtimeResource(config);
    this.audio = new AudioResource(http);
    this.videos = new VideosResource(http);
    this.moderations = new ModerationsResource(http);
    this.web = new WebResource(http);
    this.router = new RouterResource(http);
  }
}

// ── Re-exports ────────────────────────────────────────────────────────────────

export { MeshAPIApiError, StructuredOutputError } from "./errors.js";
export type { MeshAPIConfig } from "./http.js";
export type {
  StandardSchemaV1,
  JsonSchemaInput,
  StructuredParseOptions,
} from "./structured.js";

export type {
  // Shared
  RequestOptions,
  ResponseRequestIdMeta,

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
  ContentPartAudio,
  ContentPartText,
  ContentPartImage,
  ContentPartVideo,
  ImageUrl,
  VideoUrl,
  InputAudio,
  AudioOutputOptions,
  ImageOptions,
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
  ProviderPreferences,
  EmbeddingsParams,
  ImageEmbeddingUrl,
  VideoEmbeddingUrl,
  MultimodalEmbeddingInput,
  EmbeddingItem,
  EmbeddingsUsage,
  EmbeddingsResponse,
  BuiltinTool,
  ResponsesFunctionTool,
  ResponsesParams,
  ResponsesUsage,
  ResponsesResponse,
  ResponsesStreamEvent,
  ModelOverride,
  CompareParams,
  TokenUsage,
  ModelCompareResult,
  CompareResponse,
  CompareStreamEvent,
  BatchRequestItem,
  CreateBatchParams,
  BatchObject,
  BatchListResponse,

  // Images
  ImageGenerationParams,
  ImageGenerationChunk,
  ImageGenerationResponse,
  ImageItem,
  ImageUsage,

  // Templates
  TemplateSummary,
  CreateTemplateParams,
  UpdateTemplateParams,
  TemplateMessage,

  // RAG
  InitUploadRequest,
  InitUploadResponse,
  UploadFileParams,
  RagFileStatus,
  RagFileListResponse,
  ListRagFilesParams,
  BulkEmbedRequest,
  BulkEmbedResult,
  BulkEmbedResponse,
  SearchRequest,
  SearchResult,
  SearchResponse,

  // Errors (wire types)
  ApiErrorBody,
  ApiErrorEnvelope,

  // Audio
  SpeechParams,
  TranscriptionParams,
  TranscriptionTranslateParams,
  AudioTranslationsParams,
  TranscriptionResponse,
  ListVoicesParams,
  Voice,
  VoicesResponse,
  VoiceSettings,
  PronunciationDictionaryLocator,

  // Video
  VideoContentItem,
  VideoGenerationParams,
  CreateVideoGenerationResponse,
  VideoTaskError,
  VideoTaskContent,
  VideoTaskUsage,
  VideoTaskResponse,
  ListVideoGenerationsParams,
  VideoTaskListResponse,

  // Moderations
  ModerationParams,
  ModerationImageUrl,
  ModerationInputItem,
  ModerationResult,
  ModerationResponse,

  // Web search
  WebSearchParams,
  WebSearchResultItem,
  WebSearchResponse,

  // Router select
  RouterSelectParams,
  AutoRouterMeta,
  RouterSelectResponse,

  // Models search
  ModelSearchParams,
  ModelsPage,

  // Responses list/get
  ResponsesListParams,
  ResponsesListItem,
  ResponsesListResponse,

  // Image edit
  ImageRef,
  ImageEditParams,
} from "./types.js";

// Realtime
export { RealtimeResource, RealtimeSession, RealtimeError } from "./resources/realtime.js";
export type { RealtimeConnectParams, RealtimeMessage } from "./resources/realtime.js";
