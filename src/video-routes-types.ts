// ---------------------------------------------------------------------------
// Video modality routes (/v1/video/t2v, /v1/video/i2v, /v1/video/v2v, /v1/video/edits)
// ---------------------------------------------------------------------------

/** Sentinel accepted on `duration` by providers that support matching the source clip length. */
export const MATCH_SOURCE_DURATION = -1;

/** Request body shared by all video modality routes. */
export interface VideoModalityRequest {
  model: string;
  prompt?: string;
  /** Seconds, up to 300. `-1` matches the source clip length where the provider supports it. */
  duration?: number;
  [key: string]: unknown;
}

/** Video task returned when a request is submitted. */
export interface VideoModalityTask {
  id: string;
  status?: string;
  model?: string;
  /** Echoed as `null` when `-1` was sent. */
  duration?: number | null;
  [key: string]: unknown;
}

/** Video capability fields on `ModelOut` and `ModelProviderOut`. */
export interface ModelVideoCapabilities {
  /** The model accepts `POST /v1/video/t2v`. */
  supports_t2v?: boolean;
  /** The model accepts `POST /v1/video/i2v`. */
  supports_i2v?: boolean;
  /** The model accepts `POST /v1/video/v2v`. */
  supports_v2v?: boolean;
  /** Video options the model supports. */
  video_options?: Record<string, unknown> | null;
}
