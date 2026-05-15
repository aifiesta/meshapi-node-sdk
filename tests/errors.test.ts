/**
 * Unit tests for MeshAPIApiError — error construction, fromResponse(), and
 * fallback behaviour for non-JSON / malformed response bodies.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MeshAPIApiError } from "../src/errors.js";

// ── Test helper: mock a fetch Response ────────────────────────────────────────

function makeResponse(
  status: number,
  body: string,
  contentType = "application/json",
  headers: Record<string, string> = {},
): Response {
  return new Response(body, {
    status,
    headers: { "content-type": contentType, ...headers },
  });
}

// ── fromResponse — JSON bodies ────────────────────────────────────────────────

describe("MeshAPIApiError.fromResponse — JSON", () => {
  it("parses 401 unauthorized", async () => {
    const body = JSON.stringify({
      error: { code: "unauthorized", message: "Invalid or missing API key." },
      request_id: "req_001",
    });
    const err = await MeshAPIApiError.fromResponse(makeResponse(401, body));
    assert.equal(err.status, 401);
    assert.equal(err.errorCode, "unauthorized");
    assert.equal(err.requestId, "req_001");
    assert.ok(err.message.includes("Invalid or missing API key"));
  });

  it("parses 429 with retry_after_seconds", async () => {
    const body = JSON.stringify({
      error: {
        code: "rate_limit_exceeded",
        message: "Rate limit exceeded.",
        retry_after_seconds: 5,
      },
      request_id: "req_429",
    });
    const err = await MeshAPIApiError.fromResponse(makeResponse(429, body));
    assert.equal(err.status, 429);
    assert.equal(err.errorCode, "rate_limit_exceeded");
    assert.equal(err.retryAfterSeconds, 5);
  });

  it("parses 422 with validation details", async () => {
    const body = JSON.stringify({
      error: {
        code: "validation_error",
        message: "Request validation failed.",
        details: [{ type: "missing", loc: ["body", "messages"], msg: "Field required" }],
      },
      request_id: "req_422",
    });
    const err = await MeshAPIApiError.fromResponse(makeResponse(422, body));
    assert.equal(err.errorCode, "validation_error");
    assert.equal(err.details.length, 1);
  });

  it("parses 404 not_found", async () => {
    const body = JSON.stringify({
      error: { code: "not_found", message: "Resource not found." },
      request_id: "req_404",
    });
    const err = await MeshAPIApiError.fromResponse(makeResponse(404, body));
    assert.equal(err.status, 404);
    assert.equal(err.errorCode, "not_found");
  });
});

// ── fromResponse — non-JSON fallback ─────────────────────────────────────────

describe("MeshAPIApiError.fromResponse — non-JSON fallback", () => {
  it("falls back to parse_error for HTML body", async () => {
    const err = await MeshAPIApiError.fromResponse(
      makeResponse(502, "<html>Bad Gateway</html>", "text/html"),
    );
    assert.equal(err.errorCode, "parse_error");
    assert.ok(err.message.includes("Bad Gateway"));
  });

  it("falls back to parse_error for malformed JSON", async () => {
    const err = await MeshAPIApiError.fromResponse(
      makeResponse(500, "{not valid json}", "application/json"),
    );
    assert.equal(err.errorCode, "parse_error");
  });

  it("uses x-request-id header in fallback", async () => {
    const err = await MeshAPIApiError.fromResponse(
      makeResponse(502, "oops", "text/plain", { "x-request-id": "req_hdr" }),
    );
    assert.equal(err.requestId, "req_hdr");
  });
});

// ── Constructor and instanceof ────────────────────────────────────────────────

describe("MeshAPIApiError constructor", () => {
  it("is an instance of Error", async () => {
    const body = JSON.stringify({
      error: { code: "unauthorized", message: "Unauthorized." },
      request_id: "req_x",
    });
    const err = await MeshAPIApiError.fromResponse(makeResponse(401, body));
    assert.ok(err instanceof Error);
    assert.ok(err instanceof MeshAPIApiError);
    assert.equal(err.name, "MeshAPIApiError");
  });

  it("details defaults to empty array when absent", async () => {
    const body = JSON.stringify({
      error: { code: "not_found", message: "Not found." },
      request_id: "",
    });
    const err = await MeshAPIApiError.fromResponse(makeResponse(404, body));
    assert.deepEqual(err.details, []);
  });
});
