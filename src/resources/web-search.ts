import type { HttpClient } from "../http.js";
import type { WebSearchParams, WebSearchResponse, RequestOptions } from "../types.js";

/**
 * Web search namespace — POST /v1/web/search.
 *
 * Gated server-side by `WEB_SEARCH_ENABLED`; disabled deployments return
 * 403/404. The native engine is tried first and failover to another engine is
 * opaque — inspect `response.provider` to see which one served. Pinning
 * `provider` turns failover off.
 *
 * Set `include_page_content` to get each result's extracted page text alongside
 * the snippet. Only the `tinyfish` engine returns it, so pin that engine when
 * you need it.
 */
export class WebResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Run a live web search.
   *
   * @example
   * ```ts
   * const res = await client.web.search({ query: "latest Mars rover news", include_answer: true });
   * console.log(res.provider, res.answer);
   * ```
   *
   * @example With page text — pin the one engine that returns it.
   * ```ts
   * const res = await client.web.search({
   *   query: "latest Mars rover news",
   *   provider: "tinyfish",
   *   include_page_content: true,
   *   max_results: 2,
   * });
   * for (const hit of res.results) {
   *   if (hit.page_content) console.log(hit.url, hit.page_content.length, hit.page_content_truncated);
   * }
   * ```
   */
  search(params: WebSearchParams, opts?: RequestOptions): Promise<WebSearchResponse> {
    return this.http.post<WebSearchResponse>("/v1/web/search", params, opts);
  }
}
