/**
 * Web-search page content — what goes on the wire, and what comes back.
 *
 * The wire half matters because this is an additive flag: a caller who never
 * sets it must send exactly the body it sent before. TypeScript types vanish at
 * runtime, so that guarantee is asserted against a captured request body rather
 * than trusted from the interface.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { MeshAPI } from "../src/index.js";
import type { WebSearchParams, WebSearchResponse } from "../src/index.js";

const BASE = "https://api.example.test";
const TOKEN = "rsk_test";

/** A client whose fetch records the request body and replies with `payload`. */
function capturing(payload: unknown) {
  const seen: { body?: Record<string, unknown> } = {};
  const client = new MeshAPI({
    baseUrl: BASE,
    token: TOKEN,
    fetch: async (_url: unknown, init: unknown) => {
      const req = init as { body?: string };
      seen.body = req?.body ? JSON.parse(req.body) : undefined;
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  } as never);
  return { client, seen };
}

const OK: WebSearchResponse = {
  query: "mars rovers",
  provider: "tinyfish",
  results: [],
  request_id: "req_01J",
};

describe("include_page_content on the wire", () => {
  it("is absent when the caller did not set it", async () => {
    const { client, seen } = capturing(OK);
    await client.web.search({ query: "mars rovers" });
    assert.ok(seen.body, "no request body captured");
    assert.equal(
      "include_page_content" in seen.body!,
      false,
      "an unset flag must not appear on the wire",
    );
  });

  it("is sent when requested", async () => {
    const { client, seen } = capturing(OK);
    await client.web.search({ query: "mars rovers", include_page_content: true });
    assert.equal(seen.body!.include_page_content, true);
  });

  it("carries a pinned tinyfish engine through", async () => {
    const { client, seen } = capturing(OK);
    await client.web.search({ query: "mars rovers", provider: "tinyfish", include_page_content: true });
    assert.equal(seen.body!.provider, "tinyfish");
  });
});

describe("every documented engine is assignable", () => {
  it("accepts native, tavily and tinyfish", () => {
    // Type-level: tinyfish used to be missing from the union, so this would not
    // compile. `npm run typecheck:tests` is what actually enforces it.
    const engines: NonNullable<WebSearchParams["provider"]>[] = ["native", "tavily", "tinyfish"];
    assert.deepEqual(engines, ["native", "tavily", "tinyfish"]);
  });
});

describe("reading page content back", () => {
  it("exposes the text and the truncation flag", async () => {
    const { client } = capturing({
      query: "mars rovers",
      provider: "tinyfish",
      request_id: "req_01J",
      results: [
        {
          title: "Perseverance",
          url: "https://example.com/p",
          content: "a short snippet",
          score: 0.9,
          page_content: "the full extracted page text",
          page_content_truncated: true,
        },
      ],
    });
    const res = await client.web.search({ query: "mars rovers", include_page_content: true });
    const hit = res.results[0]!;
    assert.equal(hit.page_content, "the full extracted page text");
    assert.equal(hit.page_content_truncated, true);
    // The snippet is a separate field; page text never replaces it.
    assert.equal(hit.content, "a short snippet");
  });

  it("keeps a null page_content distinct from empty text", async () => {
    const { client } = capturing({
      query: "q",
      provider: "tinyfish",
      request_id: "req_01J",
      results: [{ title: "t", url: "https://example.com", content: "snippet", page_content: null, page_content_truncated: false }],
    });
    const res = await client.web.search({ query: "q", include_page_content: true });
    assert.equal(res.results[0]!.page_content, null);
    assert.notEqual(res.results[0]!.page_content, "");
  });

  it("survives a response that omits both keys", async () => {
    const { client } = capturing({
      query: "q",
      provider: "native",
      request_id: "req_01J",
      results: [{ title: "t", url: "https://example.com", content: "snippet" }],
    });
    const res = await client.web.search({ query: "q" });
    assert.equal(res.results[0]!.page_content, undefined);
    assert.equal(res.results[0]!.page_content_truncated, undefined);
  });
});
