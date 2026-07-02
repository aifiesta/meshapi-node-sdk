import { makeLazySSEIterable } from "../http.js";
import type { HttpClient } from "../http.js";
import type {
  ImageEditParams,
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

  /**
   * Edit an image (JSON/base64 mode). `image` (and optional `mask` /
   * `reference_images`) take a base64 or `data:` URL — remote http(s) URLs are
   * rejected by this endpoint.
   *
   * @example
   * ```ts
   * const edited = await client.images.edit({
   *   model: "openai/gpt-image-1",
   *   image: "data:image/png;base64,...",
   *   prompt: "Replace the background with a beach at sunset",
   * });
   * ```
   */
  edit(params: ImageEditParams, opts?: RequestOptions): Promise<ImageGenerationResponse> {
    return this.http.post<ImageGenerationResponse>("/v1/images/edits", params, opts);
  }
}
