import type { HttpClient } from "../http.js";
import type { ListModelsParams, ModelInfo, RequestOptions } from "../types.js";

export class ModelsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * List all available models.
   *
   * @param params - Optional filter: `{ free: true }` for free models only,
   *   `{ free: false }` for paid only, omit for all.
   *
   * Auth: API key (`rsk_...`) or Supabase JWT
   *
   * @example
   * ```ts
   * const models = await client.models.list();
   * const freeOnly = await client.models.list({ free: true });
   * ```
   */
  async list(params?: ListModelsParams, opts?: RequestOptions): Promise<ModelInfo[]> {
    const qs = params?.free !== undefined ? `?free=${params.free}` : "";
    return this.http.get<ModelInfo[]>(`/v1/models${qs}`, opts);
  }

  /**
   * List only free-tier models (zero prompt + completion cost).
   *
   * Auth: API key (`rsk_...`) or Supabase JWT
   *
   * @example
   * ```ts
   * const freeModels = await client.models.free();
   * ```
   */
  async free(opts?: RequestOptions): Promise<ModelInfo[]> {
    return this.http.get<ModelInfo[]>("/v1/models/free", opts);
  }

  /**
   * List only paid models.
   *
   * Auth: API key (`rsk_...`) or Supabase JWT
   *
   * @example
   * ```ts
   * const paidModels = await client.models.paid();
   * ```
   */
  async paid(opts?: RequestOptions): Promise<ModelInfo[]> {
    return this.http.get<ModelInfo[]>("/v1/models/paid", opts);
  }
}
