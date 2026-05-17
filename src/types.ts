/**
 * All request/response types for the MeshAPI SDK.
 * Derived from the MeshAPI Python Pydantic schemas.
 */

// ── Shared ────────────────────────────────────────────────────────────────────

export interface RequestOptions {
  /** Per-request AbortSignal to cancel the request. */
  signal?: AbortSignal;
  /** Per-request timeout override in milliseconds. Ignored for streaming. */
  timeoutMs?: number;
}

// ── Chat ──────────────────────────────────────────────────────────────────────

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ImageUrl {
  url: string;
  detail?: "auto" | "low" | "high";
}

export interface ContentPartText {
  type: "text";
  text: string;
}

export interface ContentPartImage {
  type: "image_url";
  image_url: ImageUrl;
}

export interface InputAudio {
  data: string;
  format: "wav" | "mp3" | "aiff" | "aac" | "ogg" | "flac" | "m4a" | "pcm16" | "pcm24";
}

export interface ContentPartAudio {
  type: "input_audio";
  input_audio: InputAudio;
}

export type ContentPart = ContentPartText | ContentPartImage | ContentPartAudio;

export interface ToolFunction {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

export interface Tool {
  type: "function";
  function: ToolFunction;
}

export interface ToolCallFunction {
  name: string;
  arguments: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: ToolCallFunction;
}

export type ToolChoice =
  | "auto"
  | "none"
  | "required"
  | { type: "function"; function: { name: string } };

export interface AudioOutputOptions {
  voice?: string;
  format?: "wav" | "mp3" | "flac" | "opus" | "pcm16";
}

export interface ImageOptions {
  n?: number;
  size?: string;
  quality?: string;
  response_format?: "url" | "b64_json";
}

export interface ChatMessage {
  role: ChatRole;
  content: string | ContentPart[] | null;
  name?: string;
  /** Present when role is "tool" */
  tool_call_id?: string;
  /** Present when role is "assistant" with tool use */
  tool_calls?: ToolCall[];
}

export interface ChatCompletionParams {
  /**
   * Model ID (e.g. "openai/gpt-4o"). Optional if the API key has a default model.
   */
  model?: string;
  messages: ChatMessage[];

  // MeshAPI extensions — stripped before forwarding to upstream
  /** Prompt template name or ID to use */
  template?: string;
  /** Variable values for {{slot}} substitution in the template */
  variables?: Record<string, string>;
  /** Groups related requests for analytics */
  session_id?: string;

  // Streaming
  stream?: boolean;

  // Standard inference params
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string | string[];
  seed?: number;
  tools?: Tool[];
  tool_choice?: ToolChoice;

  // OpenRouter extensions
  /** Context compression transforms (e.g. ["middle-out"]) */
  transforms?: string[];
  /** Ordered fallback model list if primary model is unavailable */
  models?: string[];

  /** Client identifier for abuse-detection (max 256 chars) */
  user?: string;
  modality?: "text" | "image";
  image?: ImageOptions;
  async_mode?: boolean;
  modalities?: Array<"text" | "audio">;
  audio?: AudioOutputOptions;
}

export interface UsageInfo {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details?: Record<string, unknown>;
  completion_tokens_details?: Record<string, unknown>;
  classifier_prompt_tokens?: number;
  classifier_completion_tokens?: number;
  classifier_tokens?: number;
}

export interface ChatCompletionMessage {
  role: ChatRole;
  content: string | ContentPart[] | null;
  tool_calls?: ToolCall[];
  audio?: Record<string, unknown>;
}

export interface ChatCompletionChoice {
  index: number;
  message: ChatCompletionMessage;
  finish_reason: string | null;
  logprobs: Record<string, unknown> | null;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage: UsageInfo | null;
  system_fingerprint: string | null;
}

// ── Streaming ─────────────────────────────────────────────────────────────────

export interface ChatCompletionChunkDelta {
  role?: ChatRole;
  content?: string;
  tool_calls?: ToolCall[];
  audio?: Record<string, unknown>;
}

export interface ChatCompletionChunkChoice {
  index: number;
  delta: ChatCompletionChunkDelta;
  finish_reason: string | null;
}

export interface ChatCompletionChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ChatCompletionChunkChoice[];
  usage?: UsageInfo;
  cost?: string | null;
}

// ── Models ────────────────────────────────────────────────────────────────────

export interface ModelPricing {
  /** Price per 1,000 prompt tokens in USD (as decimal string) */
  prompt_usd_per_1k: string | null;
  /** Price per 1,000 completion tokens in USD (as decimal string) */
  completion_usd_per_1k: string | null;
  /** Price per image (as decimal string) */
  image_usd_per_image?: string | null;
  /** Discount percentage applied to this caller (as decimal string) */
  discount_pct?: string | null;
  /** Discounted prompt price per 1k (as decimal string) */
  prompt_usd_per_1k_discounted?: string | null;
  /** Discounted completion price per 1k (as decimal string) */
  completion_usd_per_1k_discounted?: string | null;
}

export interface ModelInfo {
  id: string;
  name: string;
  context_length: number | null;
  is_free: boolean;
  pricing: ModelPricing;
  description?: string | null;
  supports_thinking?: boolean;
  supports_completions_api?: boolean;
  supports_responses_api?: boolean;
  model_type?: string;
  input_modalities?: string[];
  output_modalities?: string[];
}

export interface ListModelsParams {
  /** true = free models only, false = paid only, omit = all */
  free?: boolean;
}

// ── Templates ─────────────────────────────────────────────────────────────────

export interface TemplateMessage {
  role: string;
  content: string;
}

export interface CreateTemplateParams {
  name: string;
  description?: string;
  /** System prompt text */
  system?: string;
  /** Pre-seeded conversation messages */
  messages?: TemplateMessage[];
  /** Default model for this template */
  model?: string;
  /** Default inference params (temperature, max_tokens, etc.) */
  params?: Record<string, unknown>;
  /** Declared {{slot}} variable names for documentation */
  variables?: string[];
}

export interface UpdateTemplateParams {
  name?: string;
  description?: string;
  system?: string;
  messages?: TemplateMessage[];
  model?: string;
  params?: Record<string, unknown>;
  variables?: string[];
}

export interface TemplateSummary {
  id: string;
  name: string;
  owner: string | null;
  is_global: boolean;
  description: string | null;
  system: string | null;
  messages: TemplateMessage[] | null;
  model: string | null;
  params: Record<string, unknown> | null;
  variables: string[] | null;
  created_at: string;
  updated_at: string;
}

// ── Errors (wire format) ──────────────────────────────────────────────────────

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown[];
  provider_error?: Record<string, unknown>;
  retry_after_seconds?: number;
}

export interface ApiErrorEnvelope {
  error: ApiErrorBody;
  request_id: string;
}

// ── Embeddings ───────────────────────────────────────────────────────────────

export interface ProviderPreferences {
  order?: string[];
  allow_fallbacks?: boolean;
  require_parameters?: boolean;
  data_collection?: "allow" | "deny";
}

export interface EmbeddingsParams {
  model?: string;
  input: string | string[] | number[] | number[][];
  dimensions?: number;
  encoding_format?: "float" | "base64";
  input_type?: string;
  provider?: string | ProviderPreferences;
  user?: string;
}

export interface EmbeddingItem {
  object: string;
  index: number;
  embedding: number[] | string;
}

export interface EmbeddingsUsage {
  prompt_tokens: number;
  total_tokens: number;
}

export interface EmbeddingsResponse {
  object: string;
  data: EmbeddingItem[];
  model: string;
  usage?: EmbeddingsUsage | null;
}

// ── Responses ────────────────────────────────────────────────────────────────

export interface BuiltinTool {
  type:
    | "image_generation"
    | "web_search_preview"
    | "web_search_preview_2025_03_11"
    | "file_search"
    | "computer_use_preview"
    | "code_interpreter";
  [key: string]: unknown;
}

export interface ResponsesFunctionTool {
  type: "function";
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  strict?: boolean;
}

export interface ResponsesParams {
  model?: string;
  input: string | unknown[];
  template?: string;
  variables?: Record<string, string>;
  session_id?: string;
  stream?: boolean;
  max_output_tokens?: number;
  temperature?: number;
  top_p?: number;
  seed?: number;
  reasoning?: Record<string, unknown>;
  tools?: Array<ResponsesFunctionTool | BuiltinTool>;
  tool_choice?: string | Record<string, unknown>;
  response_format?: Record<string, unknown>;
  plugins?: unknown[];
  user?: string;
}

export interface ResponsesUsage {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: Record<string, unknown>;
  completion_tokens_details?: Record<string, unknown>;
  classifier_tokens?: number;
}

export interface ResponsesResponse {
  id?: string;
  object?: string;
  model?: string;
  output?: unknown[];
  usage?: ResponsesUsage | null;
  status?: string | null;
  [key: string]: unknown;
}

export interface ResponsesStreamEvent {
  type?: string;
  response?: Record<string, unknown>;
  usage?: ResponsesUsage;
  [key: string]: unknown;
}

// ── Compare ──────────────────────────────────────────────────────────────────

export interface ModelOverride {
  model: string;
  temperature?: number;
  max_tokens?: number;
  system_prompt?: string;
}

export interface CompareParams {
  models: string[];
  messages: ChatMessage[];
  model_overrides?: ModelOverride[];
  comparison_model?: string;
  comparison_instructions?: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  template?: string;
  variables?: Record<string, string>;
  skip_comparison?: boolean;
}

export interface TokenUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface ModelCompareResult {
  model: string;
  response_body?: Record<string, unknown> | null;
  content?: string | null;
  latency_ms: number;
  error?: string | null;
  error_code?: string | null;
  usage?: TokenUsage | null;
  request_id: string;
}

export interface CompareResponse {
  comparison_id: string;
  object: string;
  created: number;
  models: string[];
  results: ModelCompareResult[];
  comparison?: string | null;
  comparison_model?: string | null;
  comparison_usage?: TokenUsage | null;
  comparison_fallback_used: boolean;
  total_latency_ms: number;
  partial: boolean;
  skip_comparison: boolean;
}

export interface CompareStreamEvent {
  event?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

// ── Files / Batches ──────────────────────────────────────────────────────────

export interface BatchRequestItem {
  custom_id: string;
  method?: string;
  url?: string;
  body: Record<string, unknown>;
}

export interface UploadBatchFileParams {
  purpose?: string;
  requests: BatchRequestItem[];
}

export interface FileObject {
  id: string;
  object?: string;
  bytes?: number;
  created_at?: number;
  filename?: string;
  purpose?: string;
  status?: string;
  status_details?: unknown;
  [key: string]: unknown;
}

export interface CreateBatchParams {
  input_file_id: string;
  endpoint: string;
  completion_window: string;
  metadata?: Record<string, unknown>;
}

export interface BatchObject {
  id: string;
  object?: string;
  endpoint?: string;
  input_file_id?: string;
  output_file_id?: string | null;
  status?: string;
  model?: string;
  provider?: string;
  created_at?: number | null;
  completed_at?: number | null;
  usage_synced?: boolean;
  [key: string]: unknown;
}

export interface BatchListResponse {
  object: string;
  data: BatchObject[];
  has_more: boolean;
  first_id?: string | null;
  last_id?: string | null;
}

// ── Images ───────────────────────────────────────────────────────────────────

export interface ImageGenerationParams {
  prompt: string;
  model?: string;
  n?: number;
  size?: string;
  quality?: string;
  response_format?: "url" | "b64_json";
  output_format?: "png" | "jpeg" | "webp";
  stream?: boolean;
}

export interface ImageItem {
  url?: string;
  b64_json?: string;
  revised_prompt?: string;
}

export interface ImageUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  input_tokens_details?: Record<string, number>;
  output_tokens_details?: Record<string, number>;
}

export interface ImageGenerationResponse {
  created: number;
  data: ImageItem[];
  background?: string;
  output_format?: string;
  quality?: string;
  size?: string;
  usage?: ImageUsage;
}

export interface ImageGenerationChunk {
  id?: string;
  object?: string;
  created: number;
  model?: string;
  data: ImageItem[];
  status?: string;
}
