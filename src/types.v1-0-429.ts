/**
 * Additive request fields introduced in API spec v1.0.429.
 *
 * These are declared as module augmentations of the interfaces in `./types`
 * so they merge into the existing `ImageGenerationRequest`, `ImageOptions`
 * and `SearchRequest` types. All fields are optional; omitting them sends
 * the same request body as before.
 */
import "./types";

/**
 * Retrieval mode for `POST /v1/files/search`.
 *
 * - `"vector"`: single-pass vector retrieval.
 * - `"graph"`: retrieval that also follows document references.
 * - `"agentic"`: repeats retrieval over several steps, each aimed at the documents the previous step reached.
 *
 * A mode the server does not have enabled is refused with a 400 error
 * (`MeshAPIApiError`). Other string values are passed through unchanged.
 */
export type SearchMode = "vector" | "graph" | "agentic" | (string & {});

declare module "./types" {
  interface ImageGenerationRequest {
    /**
     * Number of frames to generate. Sent as `frame_count` on
     * `POST /v1/images/generations`. Omit for the model default.
     */
    frame_count?: number;
    /**
     * Display duration of each frame, in milliseconds. Sent as
     * `frame_duration_ms`. Omit for the model default.
     */
    frame_duration_ms?: number;
  }

  interface ImageOptions {
    /** Number of frames to generate. Forwarded as `frame_count`. */
    frame_count?: number;
    /** Display duration of each frame, in milliseconds. Forwarded as `frame_duration_ms`. */
    frame_duration_ms?: number;
  }

  interface SearchRequest {
    /** Retrieval mode. Sent as `mode`. Omit to use the server default. */
    mode?: SearchMode;
  }
}
