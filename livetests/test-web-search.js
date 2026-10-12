import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MeshAPI, MeshAPIApiError } from "meshapi-node-sdk";
import { BASE_URL, TOKEN } from "./config.js";

const client = new MeshAPI({ baseUrl: BASE_URL, token: TOKEN });

// Gated server-side by WEB_SEARCH_ENABLED — disabled deployments return 403/404.
function disabled(err) {
  return err instanceof MeshAPIApiError && [403, 404, 501].includes(err.status);
}

describe("web search", () => {
  it("basic search returns results with a provider", async (t) => {
    let res;
    try {
      res = await client.web.search({ query: "what is the capital of France", max_results: 3 });
    } catch (err) {
      if (disabled(err)) return t.skip(`web search disabled (WEB_SEARCH_ENABLED): ${err.errorCode}`);
      throw err;
    }
    assert.ok(res.query, "expected query echoed back");
    assert.ok(["native", "tavily", "tinyfish"].includes(res.provider), `unexpected provider ${res.provider}`);
    assert.ok(res.results.length <= 3, "must not exceed max_results");
    for (const hit of res.results) {
      assert.ok(hit.title && hit.url, "each result should have a title and url");
      // Not asking must never produce page text, whichever engine served.
      assert.ok(hit.page_content == null, `page text arrived unasked-for from ${res.provider}`);
      assert.ok(!hit.page_content_truncated, "truncation flag should be false when page content was not requested");
    }
  });

  it("search with answer", async (t) => {
    let res;
    try {
      res = await client.web.search({ query: "who wrote the book Dune", max_results: 5, include_answer: true });
    } catch (err) {
      if (disabled(err)) return t.skip(`web search disabled: ${err.errorCode}`);
      throw err;
    }
    assert.ok(res.query);
    assert.ok(res.answer == null || typeof res.answer === "string", "answer is best-effort");
  });

  // Page text is tinyfish-only, and the native engine is tried first, so the
  // engine is pinned rather than hoped for — an unpinned request proves nothing.
  it("page content, with the engine pinned", async (t) => {
    let res;
    try {
      res = await client.web.search({
        query: "James Webb telescope earliest galaxy",
        provider: "tinyfish",
        include_page_content: true,
        max_results: 2,
      });
    } catch (err) {
      // Covers web search being off AND this deployment having no tinyfish
      // credential, so the engine is not registered. Both are deployment
      // configuration rather than a defect in this SDK.
      if (disabled(err) || (err instanceof MeshAPIApiError && [400, 422, 503].includes(err.status))) {
        return t.skip(`tinyfish engine unavailable: ${err.errorCode}`);
      }
      throw err;
    }

    assert.equal(res.provider, "tinyfish", "pinning was ignored");
    assert.ok(res.results.length > 0, "expected at least one result");

    let withText = 0;
    for (const hit of res.results) {
      assert.ok(hit.title && hit.url, "each result should have a title and url");
      assert.equal(typeof (hit.page_content_truncated ?? false), "boolean");
      if (hit.page_content != null) {
        assert.notEqual(hit.page_content, "", "page_content should be null, never empty string");
        withText += 1;
      }
    }
    if (withText === 0) {
      // A per-URL fetch failing upstream is normal and silent, so this is a skip
      // rather than a failure — the shape above is what this SDK owns.
      t.skip("upstream returned no page text for any result on this run");
    }
  });
});
