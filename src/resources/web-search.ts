import type { HttpClient } from "../http.js";
import type { WebSearchParams, WebSearchResponse, RequestOptions } from "../types.js";

/**
 * Web search namespace — POST /v1/web/search.
 *
 * Gated server-side by `WEB_SEARCH_ENABLED`; disabled deployments return
 * 403/404. Native-first with Tavily fallback — inspect `response.provider`
 * to see which engine served the request.
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
   */
  search(params: WebSearchParams, opts?: RequestOptions): Promise<WebSearchResponse> {
    return this.http.post<WebSearchResponse>("/v1/web/search", params, opts);
  }
}
