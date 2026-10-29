/**
 * Type additions for API version v1.0.369.
 *
 * These declarations cover the request and response fields added or changed
 * in v1.0.369. They are written as standalone interfaces so the existing
 * request types in `src/types.ts` can extend them, for example:
 *
 * ```ts
 * export interface ChatCompletionRequest extends ProviderRoutingFields { ... }
 * ```
 */

// ---------------------------------------------------------------------------
// Provider routing (shared by inference request bodies)
// ---------------------------------------------------------------------------

/**
 * Provider routing preferences for a single request.
 *
 * The gateway accepts a JSON object here. Its keys are not listed in this
 * release's change set, so the type stays open. Check the API reference for
 * the supported keys before relying on a specific one.
 */
export interface ProviderPreferences {
  [key: string]: unknown;
}

/**
 * Adds the optional `provider` field.
 *
 * In v1.0.369 this field is accepted on chat completions, responses,
 * `/v1/messages`, compare, batches, image generation, video generation,
 * speech, transcriptions and translations.
 */
export interface ProviderRoutingFields {
  /** Provider routing preferences for this request. */
  provider?: ProviderPreferences | null;
}

// ---------------------------------------------------------------------------
// Chat completions
// ---------------------------------------------------------------------------

/** Fields added to `ChatCompletionRequest` in v1.0.369. */
export interface ChatCompletionRequestAdditions extends ProviderRoutingFields {
  /** Upper bound on the number of tokens the model may generate, including reasoning tokens. */
  max_completion_tokens?: number | null;
}

// ---------------------------------------------------------------------------
// Anthropic Messages (/v1/messages)
// ---------------------------------------------------------------------------

/** An MCP server the model may call during an Anthropic Messages request. */
export interface AnthropicMcpServer {
  /** Server transport type. */
  type: "url" | string;
  /** Server URL. */
  url: string;
  /** Name used to reference the server in tool calls. */
  name: string;
  /** Optional bearer token sent to the server. */
  authorization_token?: string | null;
  /** Optional tool configuration for the server. */
  tool_configuration?: Record<string, unknown> | null;
  [key: string]: unknown;
}

/** Service tier selection for an Anthropic Messages request. */
export type AnthropicServiceTier = "auto" | "standard_only" | (string & {});

/** Fields added to `AnthropicMessagesRequest` in v1.0.369. */
export interface AnthropicMessagesRequestAdditions extends ProviderRoutingFields {
  /** Container identifier to reuse across requests. */
  container?: string | Record<string, unknown> | null;
  /** MCP servers available to the model for this request. */
  mcp_servers?: AnthropicMcpServer[] | null;
  /** Service tier to request. */
  service_tier?: AnthropicServiceTier | null;
}

// ---------------------------------------------------------------------------
// Cost breakdown
// ---------------------------------------------------------------------------

/**
 * One line of a request's cost breakdown.
 *
 * Breaking in v1.0.369: `tokens` and `rate_per_1m_usd` are now optional and
 * nullable, because non-token charges (images, video seconds, platform fees)
 * also produce lines. Read `quantity`, `unit` and `rate_usd` for those lines.
 */
export interface CostLineOut {
  /** Token count for token-billed lines; `null` or absent otherwise. */
  tokens?: number | null;
  /** Rate per one million tokens for token-billed lines; `null` or absent otherwise. */
  rate_per_1m_usd?: string | null;
  /** Billed quantity, expressed in `unit`. */
  quantity?: number | string | null;
  /** Unit the quantity and rate are expressed in. */
  unit?: string | null;
  /** Rate applied per `unit`, in USD. */
  rate_usd?: string | null;
  /** Rate-card modifiers that applied to this line. */
  modifiers?: string[] | Record<string, unknown> | null;
  /** Whether this line was charged to the caller. `false` marks an informational line. */
  charged?: boolean | null;
  [key: string]: unknown;
}

/** Fields added to `CostBreakdownOut` in v1.0.369. */
export interface CostBreakdownOutAdditions {
  /** Rounding adjustment applied to the total, in USD. */
  rounding_usd?: string | null;
}

/**
 * Returns the quantity of a cost line, falling back to `tokens` for lines
 * that only report a token count.
 */
export function costLineQuantity(line: CostLineOut): number | null {
  if (line.quantity !== undefined && line.quantity !== null) {
    const n = typeof line.quantity === "number" ? line.quantity : Number(line.quantity);
    return Number.isFinite(n) ? n : null;
  }
  return typeof line.tokens === "number" ? line.tokens : null;
}

// ---------------------------------------------------------------------------
// Usage filters
// ---------------------------------------------------------------------------

/** Filter fields added to `UsageFilter` in v1.0.369. */
export interface UsageFilterAdditions {
  /** Only include events served by these providers. */
  provider?: string[] | string | null;
  /** Only include events attributed to these fault owners. */
  fault_owner?: string[] | string | null;
  /** Only include events that used (or did not use) your own provider key. */
  is_byok?: boolean | null;
  /** Only include streaming (or non-streaming) requests. */
  stream?: boolean | null;
  /** Only include events of these traffic types. Omitted means every type. */
  traffic_type?: string[] | string | null;
  /**
   * Retry attempts to include. Omitted returns the served attempt only;
   * `[true, false]` returns every attempt.
   */
  is_retry_attempt?: boolean[] | null;
}
