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
    assert.ok(["native", "tavily"].includes(res.provider), `unexpected provider ${res.provider}`);
    assert.ok(res.results.length <= 3, "must not exceed max_results");
    for (const hit of res.results) {
      assert.ok(hit.title && hit.url, "each result should have a title and url");
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
});
