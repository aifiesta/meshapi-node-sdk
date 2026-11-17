/**
 * Animated GIF frame controls for image generation.
 *
 * These fields extend `ImageGenerationRequest` (used by `POST /v1/images/generations`
 * and `POST /v1/images/edits`) and `ImageOptions` (used by the chat image path).
 * They apply when `output_format` is `"gif"`. Only models that support GIF output
 * accept them. Check `GET /v1/models` for model ids.
 *
 * Constraints enforced by the API:
 * - `frame_count` must be between 2 and 16.
 * - `frame_duration_ms` must be 20 or greater.
 * - Using GIF output with a model that does not support it, or with `model: "auto"`, returns a 400.
 * - Combining GIF output with a mask or `output_compression` returns a 422.
 * - Combining GIF output with `partial_images` on generations or chat returns a 422.
 *
 * A GIF result is returned with the `image/gif` media type.
 */
export {};

declare module './types' {
  interface ImageGenerationRequest {
    /** Number of frames in an animated GIF (2-16). Used when `output_format` is `"gif"`. */
    frame_count?: number;
    /** Display time of each GIF frame in milliseconds (20 or greater). Used when `output_format` is `"gif"`. */
    frame_duration_ms?: number;
  }

  interface ImageOptions {
    /** Number of frames in an animated GIF (2-16). Used when `output_format` is `"gif"`. */
    frame_count?: number;
    /** Display time of each GIF frame in milliseconds (20 or greater). Used when `output_format` is `"gif"`. */
    frame_duration_ms?: number;
  }
}
