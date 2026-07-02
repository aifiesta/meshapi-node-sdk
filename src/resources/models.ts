import type { HttpClient } from "../http.js";
import type {
  ListModelsParams,
  ModelInfo,
  ModelSearchParams,
  ModelsPage,
  RequestOptions,
} from "../types.js";

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

  /**
   * Paginated, filterable model catalog search (DB-only, no model cost).
   *
   * Auth: API key (`rsk_...`) or Supabase JWT
   *
   * @example
   * ```ts
   * const page = await client.models.search({ q: "gpt", limit: 10 });
   * console.log(page.total, page.brands);
   * ```
   */
  async search(params: ModelSearchParams = {}, opts?: RequestOptions): Promise<ModelsPage> {
    const qs = new URLSearchParams();
    if (params.q !== undefined) qs.set("q", params.q);
    if (params.free !== undefined) qs.set("free", String(params.free));
    if (params.discounted !== undefined) qs.set("discounted", String(params.discounted));
    for (const m of params.input_modality ?? []) qs.append("input_modality", m);
    for (const m of params.output_modality ?? []) qs.append("output_modality", m);
    for (const b of params.brand ?? []) qs.append("brand", b);
    if (params.sort !== undefined) qs.set("sort", params.sort);
    if (params.order !== undefined) qs.set("order", params.order);
    if (params.limit !== undefined) qs.set("limit", String(params.limit));
    if (params.offset !== undefined) qs.set("offset", String(params.offset));
    const query = qs.toString();
    return this.http.get<ModelsPage>(`/v1/models/search${query ? `?${query}` : ""}`, opts);
  }

  /**
   * Fetch a single model's detail by id (e.g. "openai/gpt-4o").
   *
   * Auth: API key (`rsk_...`) or Supabase JWT
   *
   * @example
   * ```ts
   * const model = await client.models.get("openai/gpt-4o");
   * ```
   */
  async get(modelId: string, opts?: RequestOptions): Promise<ModelInfo> {
    return this.http.get<ModelInfo>(`/v1/models/${modelId}`, opts);
  }
}
