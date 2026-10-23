/**
 * Request fields added in API spec v1.0.356.
 *
 * All additions are optional and non-breaking. They are declared as
 * interface augmentations of `../types`, so existing request types gain the
 * new fields without any change to call sites.
 */

/**
 * Provider preference for a request.
 *
 * Pass a provider slug (for example `"openai"`) to route the request to that
 * provider, or an object when the endpoint accepts structured routing
 * preferences. The value is sent to the API as given.
 */
export type ProviderPreference = string | Record<string, unknown>;

/**
 * An MCP server definition for `/v1/messages`.
 *
 * The shape follows the Anthropic Messages API and is sent to the API as given.
 */
export type AnthropicMcpServer = Record<string, unknown>;

declare module '../types' {
  interface ChatCompletionRequest {
    /** Upper bound on tokens generated for the completion, including reasoning tokens. */
    max_completion_tokens?: number;
    /** Provider to route this request to. */
    provider?: ProviderPreference;
  }

  interface ResponsesRequest {
    /** Provider to route this request to. */
    provider?: ProviderPreference;
  }

  interface CompareRequest {
    /** Provider to route this request to. */
    provider?: ProviderPreference;
  }

  interface CreateBatchRequest {
    /** Provider to route this batch to. */
    provider?: ProviderPreference;
  }

  interface ImageGenerationRequest {
    /** Provider to route this request to. */
    provider?: ProviderPreference;
  }

  interface VideoGenerationRequest {
    /** Provider to route this request to. */
    provider?: ProviderPreference;
  }

  interface SpeechRequest {
    /** Provider to route this request to. */
    provider?: ProviderPreference;
  }

  interface TranscriptionRequest {
    /** Provider to route this request to. Sent as a multipart form field. */
    provider?: string;
  }

  interface TranslationRequest {
    /** Provider to route this request to. Sent as a multipart form field. */
    provider?: string;
  }

  interface AnthropicMessagesRequest {
    /** Provider to route this request to. */
    provider?: ProviderPreference;
    /** Service tier for the request; forwarded with the request. */
    service_tier?: string;
    /** Anthropic container identifier. Accepted by the API but not forwarded upstream. */
    container?: string | Record<string, unknown>;
    /** Anthropic MCP server definitions. Accepted by the API but not forwarded upstream. */
    mcp_servers?: AnthropicMcpServer[];
  }
}

export {};
