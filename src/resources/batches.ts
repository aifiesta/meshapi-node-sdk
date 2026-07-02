import type { HttpClient } from "../http.js";
import type {
  BatchListResponse,
  BatchObject,
  CreateBatchParams,
  RequestOptions,
} from "../types.js";

export class BatchesResource {
  constructor(private readonly http: HttpClient) {}

  create(params: CreateBatchParams, opts?: RequestOptions): Promise<BatchObject> {
    return this.http.post<BatchObject>("/v1/batches", params, opts);
  }

  list(
    params: { after?: string; limit?: number } = {},
    opts?: RequestOptions,
  ): Promise<BatchListResponse> {
    const query = new URLSearchParams();
    if (params.after) query.set("after", params.after);
    if (params.limit !== undefined) query.set("limit", String(params.limit));
    const qs = query.toString();
    const suffix = qs ? `?${qs}` : "";
    return this.http.get<BatchListResponse>(`/v1/batches${suffix}`, opts);
  }

  get(batchId: string, opts?: RequestOptions): Promise<BatchObject> {
    return this.http.get<BatchObject>(`/v1/batches/${encodeURIComponent(batchId)}`, opts);
  }

  cancel(batchId: string, opts?: RequestOptions): Promise<BatchObject> {
    return this.http.post<BatchObject>(`/v1/batches/${encodeURIComponent(batchId)}/cancel`, {}, opts);
  }
}
