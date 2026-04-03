import type { ApiErrorBody, ApiErrorEnvelope } from "./types.js";

/**
 * Thrown for every non-2xx response from the RouterSVC API.
 *
 * @example
 * ```ts
 * try {
 *   await client.chat.completions.create({ ... });
 * } catch (err) {
 *   if (err instanceof RouterSvcApiError) {
 *     console.error(err.status, err.errorCode, err.requestId);
 *     if (err.errorCode === "rate_limit_exceeded") {
 *       console.log("Retry after:", err.retryAfterSeconds, "seconds");
 *     }
 *   }
 * }
 * ```
 */
export class RouterSvcApiError extends Error {
  /** HTTP status code (e.g. 401, 429, 500). 0 means the response body could not be parsed. */
  readonly status: number;

  /**
   * Machine-readable error code slug from the API.
   *
   * Known values: "unauthorized", "forbidden", "not_found", "model_not_found",
   * "validation_error", "unprocessable_entity", "rate_limit_exceeded",
   * "spend_limit_exceeded", "upstream_error", "gateway_timeout",
   * "internal_error", "parse_error"
   */
  readonly errorCode: string;

  /** The `request_id` from the response envelope (format: `req_<ULID>`). */
  readonly requestId: string;

  /** Validation error details array (present when errorCode is "validation_error"). */
  readonly details: unknown[];

  /** Upstream provider error info when the gateway itself is reporting a proxy failure. */
  readonly providerError: Record<string, unknown> | undefined;

  /**
   * Number of seconds to wait before retrying.
   * Present when errorCode is "rate_limit_exceeded".
   */
  readonly retryAfterSeconds: number | undefined;

  constructor(
    status: number,
    envelope: ApiErrorEnvelope,
  ) {
    super(envelope.error.message);
    this.name = "RouterSvcApiError";
    this.status = status;
    this.errorCode = envelope.error.code;
    this.requestId = envelope.request_id;
    this.details = envelope.error.details ?? [];
    this.providerError = envelope.error.provider_error;
    this.retryAfterSeconds = envelope.error.retry_after_seconds;

    // Maintains proper stack trace in V8
    const captureStackTrace = (Error as unknown as Record<string, unknown>)[
      "captureStackTrace"
    ];
    if (typeof captureStackTrace === "function") {
      (captureStackTrace as (target: object, constructor: unknown) => void)(
        this,
        RouterSvcApiError,
      );
    }
  }

  /**
   * Attempt to build a RouterSvcApiError from an HTTP response.
   * Falls back to a synthetic "parse_error" if the body is not valid JSON
   * or does not match the expected envelope shape.
   */
  static async fromResponse(response: Response): Promise<RouterSvcApiError> {
    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      try {
        const body = (await response.json()) as Partial<ApiErrorEnvelope>;
        if (body.error && typeof body.error.code === "string") {
          return new RouterSvcApiError(response.status, body as ApiErrorEnvelope);
        }
      } catch {
        // fall through to parse_error
      }
    }

    // Non-JSON body (e.g. Cloudflare / nginx HTML error page)
    let rawText = "";
    try {
      rawText = await response.text();
    } catch {
      // ignore
    }

    const syntheticEnvelope: ApiErrorEnvelope = {
      error: {
        code: "parse_error",
        message: rawText.slice(0, 500) || `HTTP ${response.status}`,
      } satisfies ApiErrorBody,
      request_id: response.headers.get("x-request-id") ?? "",
    };
    return new RouterSvcApiError(response.status, syntheticEnvelope);
  }
}
