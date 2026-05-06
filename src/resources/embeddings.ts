import type { HttpClient } from "../http.js";
import type { EmbeddingsParams, EmbeddingsResponse, RequestOptions } from "../types.js";

export class EmbeddingsResource {
  constructor(private readonly http: HttpClient) {}

  create(params: EmbeddingsParams, opts?: RequestOptions): Promise<EmbeddingsResponse> {
    return this.http.post<EmbeddingsResponse>("/v1/embeddings", params, opts);
  }
}
