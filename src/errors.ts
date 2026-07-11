import type { ApiErrorBody, ApiErrorEnvelope } from "./types.js";

/**
 * Thrown for every non-2xx response from the MeshAPI API.
 *
 * @example
 * ```ts
 * try {
 *   await client.chat.completions.create({ ... });
 * } catch (err) {
 *   if (err instanceof MeshAPIApiError) {
 *     console.error(err.status, err.errorCode, err.requestId);
 *     if (err.errorCode === "rate_limit_exceeded") {
 *       console.log("Retry after:", err.retryAfterSeconds, "seconds");
 *     }
 *   }
 * }
 * ```
 */
export class MeshAPIApiError extends Error {
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
    this.name = "MeshAPIApiError";
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
        MeshAPIApiError,
      );
    }
  }

  /**
   * Attempt to build a MeshAPIApiError from an HTTP response.
   * Falls back to a synthetic "parse_error" if the body is not valid JSON
   * or does not match the expected envelope shape.
   */
  static async fromResponse(response: Response): Promise<MeshAPIApiError> {
    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      try {
        const body = (await response.json()) as Partial<ApiErrorEnvelope>;
        if (body.error && typeof body.error.code === "string") {
          return new MeshAPIApiError(response.status, body as ApiErrorEnvelope);
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
    return new MeshAPIApiError(response.status, syntheticEnvelope);
  }
}

/**
 * Thrown by `chat.completions.parse()` when the model's response cannot be
 * parsed into the requested schema.
 *
 * The most common cause is that the model does not support structured outputs
 * (`response_format`): the gateway forwards the field, the provider ignores it,
 * and the model returns plain text instead of JSON. The underlying error (a
 * `SyntaxError` from `JSON.parse` or the validator's issues) is on `.cause`.
 * A client-side error, so `status` is `0`.
 *
 * @example
 * ```ts
 * try {
 *   await client.chat.completions.parse(params, Country);
 * } catch (err) {
 *   if (err instanceof StructuredOutputError) console.error(err.message);
 * }
 * ```
 */
export class StructuredOutputError extends MeshAPIApiError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(0, {
      error: { code: "structured_output_parse_error", message },
      request_id: "",
    });
    this.name = "StructuredOutputError";
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}
