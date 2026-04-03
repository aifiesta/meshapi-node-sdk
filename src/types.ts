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

export type ContentPart = ContentPartText | ContentPartImage;

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
}

export interface UsageInfo {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatCompletionMessage {
  role: ChatRole;
  content: string | null;
  tool_calls?: ToolCall[];
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
}

export interface ChatCompletionChunkChoice {
  index: number;
  delta: ChatCompletionChunkDelta;
  finish_reason: string | null;
}

export interface ChatCompletionChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: ChatCompletionChunkChoice[];
  usage?: UsageInfo;
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
  owner: string;
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
