import type { HttpClient } from "../http.js";
import type { ImageGenerationParams, ImageGenerationResponse, RequestOptions } from "../types.js";

export class ImagesResource {
  constructor(private readonly http: HttpClient) {}

  generate(params: ImageGenerationParams, opts?: RequestOptions): Promise<ImageGenerationResponse> {
    return this.http.post<ImageGenerationResponse>("/v1/images/generations", params, opts);
  }
}
