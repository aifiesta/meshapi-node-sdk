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
  /** Base64-encoded audio data (one of data/uri/url is required). */
  data?: string | null;
  /** GCS or other cloud-storage URI for the audio. */
  uri?: string | null;
  /** Public URL for the audio. */
  url?: string | null;
  format: "wav" | "mp3" | "aiff" | "aac" | "ogg" | "flac" | "m4a" | "pcm16" | "pcm24";
}

export interface ContentPartAudio {
  type: "input_audio";
  input_audio: InputAudio;
}

export interface VideoUrl {
  url: string;
}

export interface ContentPartVideo {
  type: "video_url";
  video_url: VideoUrl;
  fps?: string | null;
}

export type ContentPart = ContentPartText | ContentPartImage | ContentPartAudio | ContentPartVideo;

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
  /** Gemini thinking models echo this back and require it on subsequent turns. */
  thought_signature?: string | null;
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
  /** Reasoning details from thinking models (e.g. Gemini extended thinking). */
  reasoning_details?: Record<string, unknown>[] | null;
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
  response_format?: Record<string, unknown>;

  // OpenRouter extensions
  /** Context compression transforms (e.g. ["middle-out"]) */
  transforms?: string[];
  /** Ordered fallback model list if primary model is unavailable */
  models?: string[];

  /** Client identifier for abuse-detection (max 256 chars) */
  user?: string;
  modality?: "text" | "image";
  image?: ImageOptions;
  /** Enable prompt caching for this request (reduces cost on repeated prompts). */
  cache?: boolean | null;
  /** Reasoning effort for thinking-capable models. */
  reasoning_effort?: "high" | "medium" | "low" | "none" | null;
  /**
   * Max seconds for the MeshAPI backend to wait for the upstream provider.
   * Overrides the server default (300 s). Use this for long-running requests
   * that may exceed 5 minutes (e.g. extended reasoning chains).
   * Note: this is separate from the SDK-level `timeoutMs` constructor option,
   * which controls the HTTP client timeout.
   */
  timeout?: number;
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
  /** Discount percentage applied to this caller (as decimal string) */
  discount_pct?: string | null;
  // All remaining pricing fields are optional strings per spec ModelPricing
  pricing_unit?: string | null;
  prompt_usd_per_1m?: string | null;
  completion_usd_per_1m?: string | null;
  image_output_usd_per_image?: string | null;
  request_usd?: string | null;
  long_context_input_usd_per_1m?: string | null;
  long_context_output_usd_per_1m?: string | null;
  cache_read_input_usd_per_1m?: string | null;
  cache_write_input_usd_per_1m?: string | null;
  cache_read_audio_input_usd_per_1m?: string | null;
  long_context_cache_read_input_usd_per_1m?: string | null;
  long_context_cache_write_input_usd_per_1m?: string | null;
  batch_input_usd_per_1m?: string | null;
  batch_output_usd_per_1m?: string | null;
  training_usd_per_1m?: string | null;
  fine_tuned_input_usd_per_1m?: string | null;
  fine_tuned_output_usd_per_1m?: string | null;
  audio_input_usd_per_1m?: string | null;
  audio_output_usd_per_1m?: string | null;
  transcription_usd_per_1m?: string | null;
  cached_audio_input_usd_per_1m?: string | null;
  cached_text_input_usd_per_1m?: string | null;
  cache_hit_usd_per_1m?: string | null;
  output_with_audio_usd_per_1m?: string | null;
  output_with_video_usd_per_1m?: string | null;
  image_input_usd_per_image?: string | null;
  image_output_size?: string | null;
  effective_date?: string | null;
  deprecated_date?: string | null;
  notes?: string | null;
  source_url?: string | null;
}

export interface ModelInfo {
  id: string;
  name: string;
  context_length: number | null;
  is_free: boolean;
  pricing: ModelPricing;
  supports_thinking: boolean;
  supports_completions_api: boolean;
  supports_responses_api: boolean;
  model_type: string;
  input_modalities: string[];
  output_modalities: string[];
  // Optional fields per spec ModelOut
  description?: string | null;
  brand?: string | null;
  /** @deprecated Use brand instead */
  provider?: string | null;
  supports_realtime?: boolean;
  supports_embeddings?: boolean;
  supports_tools?: boolean;
  supports_structured_output?: boolean;
  supports_system_prompt?: boolean;
  supports_batching?: boolean;
  supports_background_response?: boolean;
  supports_video_generation?: boolean;
  supports_image_edit?: boolean;
  supports_image_inpaint?: boolean;
  supports_image_outpaint?: boolean;
  supports_image_mix?: boolean;
  supports_image_reframe?: boolean;
  supports_image_upscale?: boolean;
  supports_image_remove_background?: boolean;
  supports_image_reference?: boolean;
  context_window?: number | null;
  standard_context_threshold?: number | null;
  realtime_session_max_tokens?: number | null;
  realtime_max_concurrent_per_owner?: number | null;
  is_composite?: boolean;
  composite_models?: string[] | null;
}

export interface ListModelsParams {
  /** true = free models only, false = paid only, omit = all */
  free?: boolean;
  /** Filter by model type */
  type?: "text" | "embedding" | "image" | "audio" | "video";
  /** Filter by model provider/brand */
  provider?: string;
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
  /** Team ID to assign this template to (org-scoped sharing). */
  team_id?: string | null;
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

export interface ImageEmbeddingUrl {
  url: string;
}

export interface VideoEmbeddingUrl {
  url: string;
}

export interface MultimodalEmbeddingInput {
  type: "text" | "image_url" | "video_url";
  text?: string | null;
  image_url?: ImageEmbeddingUrl | null;
  video_url?: VideoEmbeddingUrl | null;
}

export interface EmbeddingsParams {
  model?: string;
  input: string | string[] | number[] | number[][] | MultimodalEmbeddingInput[];
  dimensions?: number;
  encoding_format?: "float" | "base64";
  input_type?: string;
  provider?: string | ProviderPreferences;
  user?: string;
  /** BytePlus multimodal inference prompt */
  instructions?: string | null;
  /** Sparse embedding settings e.g. { type: "enabled" } */
  sparse_embedding?: Record<string, unknown> | null;
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
  plugins?: unknown[] | null;
  user?: string;
  /** Max seconds for the backend to wait for the upstream provider. Overrides the server default (300 s). */
  timeout?: number;
  /** Continue from a prior response — pass the prior response's id. */
  previous_response_id?: string | null;
  /** System-level instructions prepended before the input. */
  instructions?: string | null;
  /** Thinking/extended-reasoning configuration (e.g. { type: "enabled", budget_tokens: 5000 }). */
  thinking?: Record<string, unknown> | null;
  /** Prompt caching settings (e.g. { type: "ephemeral" }). */
  caching?: Record<string, unknown> | null;
  /** Whether to persist the response for later retrieval via GET /v1/responses. */
  store?: boolean | null;
  /** Additional output fields to include in the response (e.g. ["usage"]). */
  include?: unknown[] | null;
  /** Unix timestamp after which the stored response may be deleted. */
  expire_at?: number | null;
  /** Maximum number of tool calls per response turn (1–10). */
  max_tool_calls?: number | null;
  /** Context-window management policy (e.g. { type: "auto" }). */
  context_management?: Record<string, unknown> | null;
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

export interface CreateBatchParams {
  requests: BatchRequestItem[];
  completion_window?: string;
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
  results?: Array<Record<string, unknown>>;
  errors_detail?: Array<Record<string, unknown>>;
  error_file_id?: string | null;
  request_counts?: Record<string, unknown>;
  metadata?: Record<string, unknown> | null;
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
  model?: string | null;
  n?: number;
  size?: string;
  quality?: string;
  response_format?: "url" | "b64_json";
  output_format?: "png" | "jpeg" | "webp" | null;
  stream?: boolean;
  // Additional spec fields (ImageGenerationRequest has 21 total)
  aspect_ratio?: string | null;
  resolution?: string | null;
  output_compression?: number | null;
  background?: "transparent" | "opaque" | "auto" | null;
  moderation?: "low" | "auto" | null;
  partial_images?: number | null;
  /** Reference image(s) for image-conditioned generation (base64 or URL) */
  image?: string | string[] | null;
  seed?: number | null;
  sequential_image_generation?: "auto" | "disabled" | null;
  sequential_image_generation_options?: Record<string, unknown> | null;
  guidance_scale?: number | null;
  watermark?: boolean | null;
  optimize_prompt_options?: Record<string, unknown> | null;
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

// ── RAG (Retrieval-Augmented Generation) ─────────────────────────────────────

export interface InitUploadRequest {
  file_name: string;
  mime_type: string;
  embed?: boolean;
  metadata?: Record<string, unknown>;
}

/** Parameters for {@link RagResource.uploadFile} — combines init-upload fields with the raw file content. */
export interface UploadFileParams {
  file_name: string;
  mime_type: string;
  /** Raw file bytes to upload. */
  content: Uint8Array | string;
  embed?: boolean;
  metadata?: Record<string, unknown>;
}

export interface InitUploadResponse {
  file_id: string;
  signed_url: string;
  expires_at: string;
}

export interface RagFileStatus {
  file_id: string;
  upload_status: string;
  file_name: string;
  file_type: string;
  mime_type: string;
  size_bytes?: number | null;
  asset_url?: string | null;
  signed_url?: string | null;
  signed_url_expires_at?: string | null;
  embedding_status: string;
  created_at: string;
  updated_at: string;
  total_tokens?: number | null;
  total_cost_usd?: number | null;
  last_error_code?: string | null;
}

export interface RagFileListResponse {
  files: RagFileStatus[];
  total: number;
  limit: number;
  offset: number;
}

export interface ListRagFilesParams {
  limit?: number;
  offset?: number;
}

export interface BulkEmbedRequest {
  file_ids: string[];
  wait?: boolean;
  metadata?: Record<string, unknown>;
}

export interface BulkEmbedResult {
  file_id: string;
  embedding_status: string;
  chunk_count?: number | null;
  error?: string | null;
}

export interface BulkEmbedResponse {
  results: BulkEmbedResult[];
}

export interface SearchRequest {
  query: string;
  top_k?: number;
  file_ids?: string[];
  filter?: Record<string, unknown>;
  date_from?: number;
  date_to?: number;
}

export interface SearchResult {
  score: number;
  text: string;
  parent_text: string;
  file_id?: string | null;
  file_name?: string | null;
  file_type?: string | null;
  mime_type?: string | null;
  chunk_index?: number | null;
  created_at?: number | null;
  metadata: Record<string, unknown>;
}

export interface SearchResponse {
  results: SearchResult[];
}

export interface ImageGenerationChunk {
  id?: string;
  object?: string;
  created: number;
  model?: string;
  data: ImageItem[];
  status?: string;
}

// ── Audio ─────────────────────────────────────────────────────────────────────

export interface VoiceSettings {
  stability?: number;
  similarity_boost?: number;
  style?: number;
  use_speaker_boost?: boolean;
  speed?: number;
}

export interface PronunciationDictionaryLocator {
  pronunciation_dictionary_id: string;
  version_id: string;
}

export interface SpeechParams {
  input: string;
  model?: string;
  voice?: string;
  stream?: boolean;
  response_format?: string;
  language_code?: string;
  voice_settings?: VoiceSettings;
  pronunciation_dictionary_locators?: PronunciationDictionaryLocator[];
  seed?: number;
  previous_text?: string;
  next_text?: string;
  previous_request_ids?: string[];
  next_request_ids?: string[];
  apply_text_normalization?: string;
  apply_language_text_normalization?: boolean;
  use_pvc_as_ivc?: boolean;
  enable_logging?: boolean;
  optimize_streaming_latency?: number;
  speaker?: string;
  target_language_code?: string;
  pitch?: number;
  pace?: number;
  loudness?: number;
  speech_sample_rate?: number;
  enable_preprocessing?: boolean;
}

export interface TranscriptionParams {
  model: string;
  language_code?: string;
  tag_audio_events?: boolean;
  num_speakers?: number;
  timestamps_granularity?: string;
  diarize?: boolean;
  diarization_threshold?: number;
  additional_formats?: string;
  file_format?: string;
  cloud_storage_url?: string;
  source_url?: string;
  webhook?: boolean;
  webhook_id?: string;
  temperature?: number;
  seed?: number;
  use_multi_channel?: boolean;
  webhook_metadata?: string;
  entity_detection?: string;
  no_verbatim?: boolean;
  detect_speaker_roles?: boolean;
  entity_redaction?: string;
  entity_redaction_mode?: string;
  keyterms?: string[];
  with_timestamps?: boolean;
  debug_mode?: boolean;
}

export interface TranscriptionTranslateParams {
  model?: string;
  prompt?: string;
}

/** Parameters for POST /v1/audio/translations (standalone translate endpoint). */
export interface AudioTranslationsParams {
  /** Model ID to use for translation (required). */
  model: string;
  /** Optional hint/context prompt for the translation. */
  prompt?: string | null;
  /** Response format: "json" (default), "text", or "verbose_json". */
  response_format?: string | null;
  /** Sampling temperature in range 0–2 (higher = more random). */
  temperature?: number | null;
}

export interface TranscriptionResponse {
  text: string;
}

export interface ListVoicesParams {
  next_page_token?: string;
  page_size?: number;
  search?: string;
  sort?: string;
  sort_direction?: string;
  voice_type?: string;
  category?: string;
  include_total_count?: boolean;
  voice_ids?: string[];
}

export interface Voice {
  voice_id: string;
  name: string;
  // Optional: minimal voice objects (id + name only) must not break parsing;
  // labels are provider-defined and not always strings.
  category?: string;
  description?: string;
  preview_url?: string;
  labels?: Record<string, unknown>;
}

export interface VoicesResponse {
  voices: Voice[];
  // Optional so a response that omits has_more / total_count is not rejected,
  // and an absent pagination flag is distinguishable from a real false.
  has_more?: boolean;
  total_count?: number;
  next_page_token?: string | null;
}

// ── Video ─────────────────────────────────────────────────────────────────────

export interface VideoContentItem {
  type: string;
  text?: string;
  image_url?: Record<string, unknown>;
  video_url?: Record<string, unknown>;
  audio_url?: Record<string, unknown>;
  draft_task?: Record<string, unknown>;
  role?: string;
}

export interface VideoGenerationParams {
  model: string;
  content: VideoContentItem[];
  callback_url?: string;
  return_last_frame?: boolean;
  service_tier?: string;
  execution_expires_after?: number;
  generate_audio?: boolean;
  draft?: boolean;
  resolution?: string;
  ratio?: string;
  duration?: number;
  frames?: number;
  seed?: number;
  camera_fixed?: boolean;
  watermark?: boolean;
  safety_identifier?: string;
  priority?: number;
}

export interface CreateVideoGenerationResponse {
  id: string;
}

export interface VideoTaskError {
  code: string;
  message: string;
}

export interface VideoTaskContent {
  video_url?: string;
  last_frame_url?: string;
}

export interface VideoTaskUsage {
  completion_tokens: number;
  total_tokens: number;
}

export interface VideoTaskResponse {
  id: string;
  status: string;
  model?: string;
  error?: VideoTaskError;
  created_at?: number;
  updated_at?: number;
  content?: VideoTaskContent;
  seed?: number;
  resolution?: string;
  ratio?: string;
  duration?: number;
  frames?: number;
  framespersecond?: number;
  generate_audio?: boolean;
  safety_identifier?: string;
  priority?: number;
  draft?: boolean;
  draft_task_id?: string;
  service_tier?: string;
  execution_expires_after?: number;
  usage?: VideoTaskUsage;
}

export interface ListVideoGenerationsParams {
  status?: string;
  model?: string;
  created_after?: string;
  created_before?: string;
  limit?: number;
  offset?: number;
}

export interface VideoTaskListResponse {
  object?: string;
  data: VideoTaskResponse[];
  has_more: boolean;
  total: number;
  limit: number;
  offset: number;
}

// ── Moderations — POST /v1/moderations ──────────────────────────────────────────

export interface ModerationImageUrl {
  url: string;
}

export interface ModerationInputItem {
  type: "text" | "image_url";
  text?: string;
  image_url?: ModerationImageUrl;
}

export interface ModerationParams {
  /** Text, list of texts, or multimodal (text/image_url) items. */
  input: string | string[] | ModerationInputItem[];
  /** Moderation model; defaults to "omni-moderation-latest" server-side. */
  model?: string;
}

export interface ModerationResult {
  flagged: boolean;
  categories: Record<string, boolean>;
  category_scores: Record<string, number>;
  [key: string]: unknown;
}

export interface ModerationResponse {
  id?: string;
  model?: string;
  results: ModerationResult[];
}

// ── Web search — POST /v1/web/search ────────────────────────────────────────────

export interface WebSearchParams {
  query: string;
  model?: string;
  provider?: "native" | "tavily";
  max_results?: number;
  search_depth?: "basic" | "advanced";
  include_domains?: string[];
  exclude_domains?: string[];
  include_answer?: boolean;
}

export interface WebSearchResultItem {
  title: string;
  url: string;
  content?: string;
  score?: number | null;
  published_date?: string | null;
}

export interface WebSearchResponse {
  query: string;
  answer?: string | null;
  results: WebSearchResultItem[];
  /** "native" | "tavily" today; typed as string so a new engine cannot break parsing. */
  provider: string;
  request_id?: string;
}

// ── Router select — POST /v1/router/select ──────────────────────────────────────

export interface RouterSelectParams {
  messages: ChatMessage[];
  api_type?: "completions" | "responses" | "embeddings";
  exclude_models?: string[];
}

export interface AutoRouterMeta {
  fallback_used: boolean;
  fallback_reason?: string | null;
}

export interface RouterSelectResponse {
  model: string;
  auto_router: AutoRouterMeta;
  reasoning_effort?: string | null;
}

// ── Models search — GET /v1/models/search ───────────────────────────────────────

export interface ModelSearchParams {
  q?: string;
  free?: boolean;
  discounted?: boolean;
  input_modality?: string[];
  output_modality?: string[];
  brand?: string[];
  sort?: "brand" | "name" | "id" | "context_length";
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export interface ModelsPage {
  items: ModelInfo[];
  total: number;
  limit: number;
  offset: number;
  brands: string[];
}

// ── Responses list — GET /v1/responses, GET /v1/responses/{id} ───────────────────

export interface ResponsesListParams {
  after?: string;
  limit?: number;
}

export interface ResponsesListItem {
  id: string;
  object?: string;
  model?: string;
  provider?: string;
  status?: string;
  created_at?: number;
  completed_at?: number | null;
  usage_synced?: boolean;
}

export interface ResponsesListResponse {
  object?: string;
  data: ResponsesListItem[];
  has_more?: boolean;
  first_id?: string | null;
  last_id?: string | null;
}

// ── Image edit — POST /v1/images/edits (JSON/base64 mode) ───────────────────────

export interface ImageRef {
  /** data:image/<fmt>;base64,<b64> or a bare base64 string. Remote URLs are rejected. */
  url: string;
}

export interface ImageEditParams {
  model: string;
  /** base64 / data-URL string, or an ImageRef. */
  image: string | ImageRef;
  /** Required for the "edit", "outpaint" and "mix" operations. */
  prompt?: string;
  operation?:
    | "edit"
    | "inpaint"
    | "outpaint"
    | "mix"
    | "reframe"
    | "upscale"
    | "remove_background";
  mask?: string | ImageRef;
  reference_images?: Array<string | ImageRef>;
  n?: number;
  size?: string;
  response_format?: "url" | "b64_json";
  background?: string;
  upscale_factor?: string;
  quality_tier?: string;
  aspect_ratio?: string;
  resolution?: string;
  expand_factor?: string | number;
  mask_feather?: number;
}
