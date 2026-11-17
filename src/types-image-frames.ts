/**
 * Animated GIF frame controls for image generation.
 *
 * Adds `frame_count` and `frame_duration_ms` to `ImageGenerationRequest` and
 * `ImageOptions` by merging into the existing interfaces in `./types`, so no
 * existing field changes.
 *
 * Both fields apply only when `output_format` is `"gif"`. They are accepted on
 * `POST /v1/images/generations`, `POST /v1/images/edits` and the chat image path.
 *
 * Server-side rules:
 * - A GIF request to a model without GIF support, or with `model: "auto"`, returns 400.
 * - A GIF request with a mask or `output_compression` returns 422.
 * - A GIF request with `partial_images` returns 422 on generations and chat.
 * - A GIF result is returned as `image/gif`.
 */

export {};

declare module "./types" {
  interface ImageGenerationRequest {
    /**
     * Number of frames in an animated GIF, from 2 to 16.
     * Used only when `output_format` is `"gif"`.
     */
    frame_count?: number;
    /**
     * Display time of each GIF frame in milliseconds, 20 or more.
     * Used only when `output_format` is `"gif"`.
     */
    frame_duration_ms?: number;
  }

  interface ImageOptions {
    /**
     * Number of frames in an animated GIF, from 2 to 16.
     * Used only when `output_format` is `"gif"`.
     */
    frame_count?: number;
    /**
     * Display time of each GIF frame in milliseconds, 20 or more.
     * Used only when `output_format` is `"gif"`.
     */
    frame_duration_ms?: number;
  }
}
