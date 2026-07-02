import type { HttpClient } from "../http.js";
import type { RouterSelectParams, RouterSelectResponse, RequestOptions } from "../types.js";

/**
 * Router namespace — POST /v1/router/select.
 *
 * Select-only Auto Router: returns the model the Auto Router *would* pick for a
 * prompt without running inference, so the caller can run inference itself.
 * Gated server-side by `AUTO_ROUTER_ENABLED`. Fail-soft: on classification
 * failure it returns the default model with `auto_router.fallback_used = true`.
 */
export class RouterResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Return the model the Auto Router would select for the given messages.
   *
   * @example
   * ```ts
   * const sel = await client.router.select({ messages: [{ role: "user", content: "Prove 2+2=4." }] });
   * console.log(sel.model, sel.auto_router.fallback_used);
   * ```
   */
  select(params: RouterSelectParams, opts?: RequestOptions): Promise<RouterSelectResponse> {
    return this.http.post<RouterSelectResponse>("/v1/router/select", params, opts);
  }
}
