import type { ApiErrorBody, ApiErrorEnvelope } from "./types.js";

/**
 * Read the `Retry-After` response header as whole seconds.
 *
 * RFC 9110 allows either delta-seconds or an HTTP-date; both are handled. A
 * past date clamps to 0. Returns `undefined` when the header is absent or
 * unparseable, so callers can `??=` it over a body-supplied value.
 */
function parseRetryAfterSeconds(response: Response): number | undefined {
  const header = response.headers.get("retry-after");
  if (!header) return undefined;

  const seconds = Number(header.trim());
  if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds));

  const at = Date.parse(header);
  if (Number.isNaN(at)) return undefined;
  return Math.max(0, Math.ceil((at - Date.now()) / 1000));
}

/**
 * Error code for a response whose body was not parseable JSON.
 *
 * `"parse_error"` should mean "we could not tell what went wrong". For a 4xx
 * the status itself is definitive, so reporting a parse failure hides the real
 * cause — `videos.retrieve()` on an unknown id answers 404 with a non-JSON body
 * and used to surface as `parse_error` rather than `not_found`.
 *
 * 5xx deliberately still maps to `"parse_error"`: an unparseable server error
 * really is a response we could not interpret, and existing behaviour for
 * gateway HTML error pages is pinned by tests.
 */
function codeForStatus(status: number): string {
  switch (status) {
    case 400: return "bad_request";
    case 401: return "unauthorized";
    case 402: return "spend_limit_exceeded";
    case 403: return "forbidden";
    case 404: return "not_found";
    case 408: return "timeout";
    case 409: return "conflict";
    case 422: return "validation_error";
    case 429: return "rate_limit_exceeded";
    default: return "parse_error";
  }
}

/**
 * Human-readable message for a JSON error body that is not the Mesh envelope.
 *
 * Several endpoints answer with FastAPI's shape — `{"detail": "..."}` for a
 * plain rejection, or `{"detail": [{loc, msg, type}]}` for a validation failure.
 * Without this the message was dropped and callers saw only "HTTP 422".
 */
function messageFromNonEnvelope(body: unknown, status: number): string {
  const detail = (body as { detail?: unknown } | null)?.detail;

  if (typeof detail === "string" && detail.trim()) return detail;

  if (Array.isArray(detail) && detail.length > 0) {
    const parts = detail
      .map((d) => {
        const rec = d as { loc?: unknown[]; msg?: unknown };
        const where = Array.isArray(rec?.loc) ? rec.loc.join(".") : "";
        const msg = typeof rec?.msg === "string" ? rec.msg : JSON.stringify(d);
        return where ? `${where}: ${msg}` : msg;
      })
      .filter(Boolean);
    if (parts.length) return parts.join("; ").slice(0, 500);
  }

  if (typeof (body as { message?: unknown } | null)?.message === "string") {
    return (body as { message: string }).message;
  }

  try {
    const json = JSON.stringify(body);
    if (json && json !== "{}" && json !== "null") return json.slice(0, 500);
  } catch {
    // fall through
  }
  return `HTTP ${status}`;
}

/** Alias kept short for use inside object spreads. */
function retryAfterFrom(response: Response): number | undefined {
  return parseRetryAfterSeconds(response);
}

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
          // RFC 9110 puts the retry delay in the `Retry-After` header; the body
          // field is a Mesh convenience that not every response carries. Fall
          // back to the header so `retryAfterSeconds` is populated whenever the
          // server said anything at all — the retry scheduler already reads it,
          // and callers following the documented rate-limit snippet expect it.
          if (body.error.retry_after_seconds === undefined) {
            const fromHeader = parseRetryAfterSeconds(response);
            if (fromHeader !== undefined) body.error.retry_after_seconds = fromHeader;
          }
          // Same reasoning as `retry_after_seconds`: prefer the envelope, but
          // fall back to the header rather than surfacing an empty id. The two
          // fallback branches below already do this — only the happy path,
          // which is the one that runs for virtually every real error, did not.
          if (!body.request_id) {
            body.request_id = response.headers.get("x-request-id") ?? "";
          }
          return new MeshAPIApiError(response.status, body as ApiErrorEnvelope);
        }

        // Valid JSON, but not the Mesh envelope — several endpoints answer with
        // FastAPI's `{"detail": ...}` instead. The body is already consumed at
        // this point, so falling through to `response.text()` below throws and
        // the message is lost entirely, leaving a bare "HTTP 422". Build the
        // error from what we already parsed.
        return new MeshAPIApiError(response.status, {
          error: {
            code: codeForStatus(response.status),
            message: messageFromNonEnvelope(body, response.status),
            ...(Array.isArray((body as { detail?: unknown }).detail)
              ? { details: (body as { detail: unknown[] }).detail }
              : {}),
            ...(retryAfterFrom(response) !== undefined
              ? { retry_after_seconds: retryAfterFrom(response) as number }
              : {}),
          },
          request_id: response.headers.get("x-request-id") ?? "",
        });
      } catch {
        // Not JSON after all — fall through to the raw-text fallback.
      }
    }

    // Non-JSON body (e.g. Cloudflare / nginx HTML error page)
    let rawText = "";
    try {
      rawText = await response.text();
    } catch {
      // ignore
    }

    const retryAfter = parseRetryAfterSeconds(response);
    const syntheticEnvelope: ApiErrorEnvelope = {
      error: {
        code: codeForStatus(response.status),
        message: rawText.slice(0, 500) || `HTTP ${response.status}`,
        ...(retryAfter !== undefined ? { retry_after_seconds: retryAfter } : {}),
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
