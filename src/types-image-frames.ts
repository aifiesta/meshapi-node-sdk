/**
 * Animated GIF frame options for image generation (spec v1.0.426).
 *
 * These fields are merged into the existing `ImageGenerationRequest` and
 * `ImageOptions` interfaces declared in `./types`. They only apply when the
 * request sets `output_format: "gif"`, and only on models that support GIF
 * output. Other models return a 400.
 */
export {};

declare module './types' {
  interface ImageGenerationRequest {
    /**
     * Number of frames in an animated GIF result. Accepted range: 2-16.
     * Only valid with `output_format: "gif"`.
     */
    frame_count?: number;
    /**
     * Display time of each GIF frame, in milliseconds. Minimum: 20.
     * Only valid with `output_format: "gif"`.
     */
    frame_duration_ms?: number;
  }

  interface ImageOptions {
    /**
     * Number of frames in an animated GIF result. Accepted range: 2-16.
     * Only valid with `output_format: "gif"`.
     */
    frame_count?: number;
    /**
     * Display time of each GIF frame, in milliseconds. Minimum: 20.
     * Only valid with `output_format: "gif"`.
     */
    frame_duration_ms?: number;
  }
}
