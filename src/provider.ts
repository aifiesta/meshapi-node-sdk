/**
 * Types and helpers for the v1.0.364 API changes:
 * - per-request provider pinning (`provider`) on inference request bodies,
 * - `max_completion_tokens` on chat completions,
 * - new Anthropic Messages request fields,
 * - expanded cost line items on usage cost breakdowns.
 *
 * This module is additive. Merge these declarations into `src/types.ts`
 * and re-export them from `src/index.ts` when the slice is integrated.
 */

// ---------------------------------------------------------------------------
// Provider pinning
// ---------------------------------------------------------------------------

/**
 * Pins a single request to one upstream provider.
 *
 * The request is served by that provider or refused. It is never rerouted.
 * A refusal returns HTTP 400 with error code `invalid_provider_pin`. If the
 * pinned provider cannot serve the requested model, the error code is
 * `model_not_available_on_pinned_provider`.
 *
 * A request may restate the pin already set on its API key, but cannot
 * replace it with a different provider.
 *
 * @example
 * ```ts
 * await client.chat.completions.create({
 *   model,
 *   messages: [{ role: "user", content: "Hello" }],
 *   provider: "openai",
 * });
 * ```
 */
export interface ProviderPinParams {
  /** Provider slug to serve this request. Omit to let the gateway route. */
  provider?: string | null;
}

/** Fields added to `ChatCompletionRequest` (`POST /v1/chat/completions`). */
export interface ChatCompletionRequestV1_0_364 extends ProviderPinParams {
  /**
   * Upper bound on generated tokens. Must be an integer of at least 1.
   * Takes precedence over `max_tokens` when both are sent.
   */
  max_completion_tokens?: number | null;
}

/** Fields added to `AnthropicMessagesRequest` (`POST /v1/messages`). */
export interface AnthropicMessagesRequestV1_0_364 extends ProviderPinParams {
  /** Container identifier or configuration, passed through to the provider. */
  container?: string | Record<string, unknown> | null;
  /** MCP server definitions, passed through to the provider. */
  mcp_servers?: Array<Record<string, unknown>> | null;
  /** Requested service tier. */
  service_tier?: string | null;
}

/** `provider` on `ResponsesRequest` (`POST /v1/responses`). */
export type ResponsesRequestV1_0_364 = ProviderPinParams;
/** `provider` on `CompareRequest` (`POST /v1/chat/compare`). */
export type CompareRequestV1_0_364 = ProviderPinParams;
/** `provider` on `CreateBatchRequest` (`POST /v1/batches`). */
export type CreateBatchRequestV1_0_364 = ProviderPinParams;
/** `provider` on `ImageGenerationRequest` (`POST /v1/images/generations`). */
export type ImageGenerationRequestV1_0_364 = ProviderPinParams;
/** `provider` on `VideoGenerationRequest` (`POST /v1/video/generations`). */
export type VideoGenerationRequestV1_0_364 = ProviderPinParams;
/** `provider` on `SpeechRequest` (`POST /v1/audio/speech`). */
export type SpeechRequestV1_0_364 = ProviderPinParams;
/**
 * `provider` form field on `/v1/audio/transcriptions`,
 * `/v1/audio/translations` and `/v1/audio/transcriptions/translate`.
 * Send it as a text form part, not a file part.
 */
export type AudioFormRequestV1_0_364 = ProviderPinParams;

/**
 * Validates `max_completion_tokens` before sending.
 *
 * @throws RangeError when the value is not an integer of at least 1.
 */
export function assertMaxCompletionTokens(value: number | null | undefined): void {
  if (value === null || value === undefined) return;
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError("max_completion_tokens must be an integer >= 1");
  }
}

/**
 * Appends `provider` to a multipart form as a text part when set.
 * An absent value adds nothing, so the gateway routes normally.
 */
export function appendProviderField(form: FormData, provider: string | null | undefined): FormData {
  if (provider !== null && provider !== undefined) {
    form.append("provider", provider);
  }
  return form;
}

// ---------------------------------------------------------------------------
// Cost breakdown
// ---------------------------------------------------------------------------

/**
 * One charge line on a request's cost breakdown.
 *
 * Breaking change in v1.0.364: `tokens` and `rate_per_1m_usd` are now
 * optional and may be `null`, because non-token charges (images, video)
 * carry a line too. Read `quantity`, `unit` and `rate_usd` instead.
 */
export interface CostLineOut {
  /** Token count for token-billed lines; `null` for other units. */
  tokens?: number | null;
  /** Rate per one million tokens in USD; `null` for non-token lines. */
  rate_per_1m_usd?: string | null;
  /** Quantity billed, in `unit`. */
  quantity?: number | string | null;
  /** Unit the quantity is measured in. */
  unit?: string | null;
  /** Rate in USD per `unit`. */
  rate_usd?: string | null;
  /** Whether this line was charged. `false` marks an informational line. */
  charged?: boolean | null;
  /** Rate-card modifiers that applied to this line. */
  modifiers?: string[] | Record<string, unknown> | null;
  [key: string]: unknown;
}

/** A request's cost breakdown. */
export interface CostBreakdownOut {
  lines?: CostLineOut[] | null;
  /** Rounding adjustment in USD. */
  rounding_usd?: string | null;
  [key: string]: unknown;
}

/**
 * Returns the billed quantity and unit of a line, falling back to
 * `tokens` for lines that only carry a token count.
 */
export function costLineQuantity(line: CostLineOut): { quantity: number | string | null; unit: string | null } {
  if (line.quantity !== undefined && line.quantity !== null) {
    return { quantity: line.quantity, unit: line.unit ?? null };
  }
  if (line.tokens !== undefined && line.tokens !== null) {
    return { quantity: line.tokens, unit: line.unit ?? "tokens" };
  }
  return { quantity: null, unit: line.unit ?? null };
}

/** Returns true unless the line is explicitly marked `charged: false`. */
export function isCostLineCharged(line: CostLineOut): boolean {
  return line.charged !== false;
}
