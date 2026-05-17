import { makeLazySSEIterable } from "../http.js";
import type { HttpClient } from "../http.js";
import type {
  ImageGenerationChunk,
  ImageGenerationParams,
  ImageGenerationResponse,
  RequestOptions,
} from "../types.js";

export class ImagesResource {
  constructor(private readonly http: HttpClient) {}

  generate(params: ImageGenerationParams, opts?: RequestOptions): Promise<ImageGenerationResponse> {
    return this.http.post<ImageGenerationResponse>("/v1/images/generations", params, opts);
  }

  stream(params: ImageGenerationParams, opts?: RequestOptions): AsyncIterable<ImageGenerationChunk> {
    return makeLazySSEIterable(this.http, "/v1/images/generations", { ...params, stream: true }, opts);
  }
}
