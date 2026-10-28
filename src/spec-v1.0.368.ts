/**
 * Type additions for API spec v1.0.368.
 *
 * These declarations describe fields added to existing request and response
 * shapes. Merge them into the matching interfaces in `src/types.ts` and
 * re-export them from `src/index.ts`. They are kept in a separate module here
 * so the change can be reviewed on its own.
 */

// ---------------------------------------------------------------------------
// Per-request provider selection
// ---------------------------------------------------------------------------

/**
 * Names the upstream provider that should serve a request, for example
 * `"openai"` or `"bedrock"`.
 *
 * Accepted on `POST /v1/chat/completions`, `/v1/responses`, `/v1/messages`,
 * `/v1/chat/compare`, `/v1/batches`, `/v1/images/generations`, video
 * generation, speech, transcription and translation requests.
 */
export type ProviderOption = string;

/** Mixin for every request body that accepts a `provider` field. */
export interface ProviderSelectable {
  /** Upstream provider to serve this request. Omit to let routing choose. */
  provider?: ProviderOption | null;
}

// ---------------------------------------------------------------------------
// Chat completions
// ---------------------------------------------------------------------------

/** Fields added to `ChatCompletionRequest`. */
export interface ChatCompletionRequestAdditions extends ProviderSelectable {
  /**
   * Maximum number of tokens to generate. OpenAI's current name for the
   * output cap. Must be at least 1. When both `max_completion_tokens` and
   * `max_tokens` are sent, `max_completion_tokens` wins.
   */
  max_completion_tokens?: number | null;
}

// ---------------------------------------------------------------------------
// Anthropic Messages
// ---------------------------------------------------------------------------

/** An MCP server definition passed through on `POST /v1/messages`. */
export interface AnthropicMcpServer {
  type?: string;
  name?: string;
  url?: string;
  [key: string]: unknown;
}

/** Fields added to `AnthropicMessagesRequest`. */
export interface AnthropicMessagesRequestAdditions extends ProviderSelectable {
  /** Container to reuse for tool execution. Passed through as sent. */
  container?: unknown;
  /** MCP servers available to the model for this request. */
  mcp_servers?: AnthropicMcpServer[] | null;
  /** Service tier requested for this call. Passed through as sent. */
  service_tier?: string | null;
}

// ---------------------------------------------------------------------------
// Cost breakdown
// ---------------------------------------------------------------------------

/**
 * One line of a request's cost breakdown.
 *
 * Breaking in v1.0.368: `tokens` and `rate_per_1m_usd` are now optional and
 * nullable, because non-token charges (images, video, platform fees) carry a
 * `quantity`, `unit` and `rate_usd` instead. Read those fields when `tokens`
 * is `null`.
 */
export interface CostLineOut {
  [key: string]: unknown;
  /** Token count for token-priced lines; `null` for other units. */
  tokens?: number | null;
  /** Per-1M-token rate as a decimal string; `null` for other units. */
  rate_per_1m_usd?: string | null;
  /** Billed quantity in `unit` (for example images or seconds). */
  quantity?: number | string | null;
  /** Unit the `quantity` and `rate_usd` are expressed in. */
  unit?: string | null;
  /** Rate per `unit` as a decimal string. */
  rate_usd?: string | null;
  /** Whether this line was charged; `false` for BYOK self-served model cost. */
  charged?: boolean | null;
  /** Rate-card modifiers that applied to this line. */
  modifiers?: unknown[] | null;
}

/** Fields added to `CostBreakdownOut`. */
export interface CostBreakdownOutAdditions {
  /** Rounding adjustment applied to the total, as a decimal string. */
  rounding_usd?: string | null;
}

/** Returns true when a cost line is priced per token. */
export function isTokenCostLine(
  line: CostLineOut,
): line is CostLineOut & { tokens: number } {
  return typeof line.tokens === 'number';
}

// ---------------------------------------------------------------------------
// Usage filter
// ---------------------------------------------------------------------------

/** Fields added to `UsageFilter` for usage events, counts, summary and export. */
export interface UsageFilterAdditions {
  /** Only rows served by these providers. */
  provider?: unknown;
  /** Only rows attributed to these fault owners. */
  fault_owner?: unknown;
  /** Only BYOK rows (`true`) or platform-credential rows (`false`). */
  is_byok?: unknown;
  /** Only streamed (`true`) or non-streamed (`false`) rows. */
  stream?: unknown;
  /** Only rows of these traffic types. Defaults to every type. */
  traffic_type?: unknown;
  /**
   * Retry attempts to include. Omitted returns served attempts only;
   * `[true, false]` includes retry attempts too.
   */
  is_retry_attempt?: unknown;
}
