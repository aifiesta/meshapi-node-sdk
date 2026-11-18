/**
 * Animated image (GIF) frame options.
 *
 * Spec v1.0.427 adds two optional fields to `ImageGenerationRequest` and
 * `ImageOptions`:
 *
 * - `frame_count`: number of frames in an animated result.
 * - `frame_duration_ms`: display time of each frame, in milliseconds.
 *
 * Both fields are optional and additive, so existing requests are unchanged.
 * The gateway validates the values and returns an error if they are not
 * accepted for the chosen model or output format.
 *
 * This module adds the fields to the existing interfaces through module
 * augmentation.
 */

/** Frame settings shared by image generation requests and image options. */
export interface ImageFrameOptions {
  /**
   * Number of frames to render in an animated (GIF) result.
   * Optional; omit it to let the server choose.
   */
  frame_count?: number;
  /**
   * How long each frame is shown, in milliseconds.
   * Optional; omit it to let the server choose.
   */
  frame_duration_ms?: number;
}

declare module './types' {
  interface ImageGenerationRequest {
    /** Number of frames to render in an animated (GIF) result. */
    frame_count?: number;
    /** How long each frame is shown, in milliseconds. */
    frame_duration_ms?: number;
  }

  interface ImageOptions {
    /** Number of frames to render in an animated (GIF) result. */
    frame_count?: number;
    /** How long each frame is shown, in milliseconds. */
    frame_duration_ms?: number;
  }
}
