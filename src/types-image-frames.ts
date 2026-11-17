/**
 * Animated image output fields for image generation (spec v1.0.425).
 *
 * These fields are merged into the existing `ImageGenerationRequest` and
 * `ImageOptions` interfaces from `./types` through declaration merging, so
 * the current shapes stay unchanged and existing callers keep compiling.
 *
 * Both fields are optional and additive. They only apply when the request
 * asks for an animated output (for example `output_format: "gif"`) on a
 * model that supports it; the API rejects them otherwise.
 */

declare module './types' {
  interface ImageGenerationRequest {
    /**
     * Number of frames to render for an animated image.
     *
     * The API accepts values from 2 to 16.
     */
    frame_count?: number;
    /**
     * How long each frame is shown, in milliseconds.
     *
     * The API accepts values of 20 or more.
     */
    frame_duration_ms?: number;
  }

  interface ImageOptions {
    /**
     * Number of frames to render for an animated image.
     *
     * The API accepts values from 2 to 16.
     */
    frame_count?: number;
    /**
     * How long each frame is shown, in milliseconds.
     *
     * The API accepts values of 20 or more.
     */
    frame_duration_ms?: number;
  }
}

export {};
