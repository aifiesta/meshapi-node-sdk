import type { HttpClient } from "../http.js";
import type { ModerationParams, ModerationResponse, RequestOptions } from "../types.js";

/** Moderations namespace — POST /v1/moderations. Requires a data-plane key. */
export class ModerationsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Classify text (or multimodal) input for policy violations.
   *
   * @example
   * ```ts
   * const res = await client.moderations.create({ input: "text to classify" });
   * if (res.results[0]?.flagged) console.log(res.results[0].categories);
   * ```
   */
  create(params: ModerationParams, opts?: RequestOptions): Promise<ModerationResponse> {
    return this.http.post<ModerationResponse>("/v1/moderations", params, opts);
  }
}
