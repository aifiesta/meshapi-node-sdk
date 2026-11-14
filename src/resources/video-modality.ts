import type { HttpClient } from '../http.js';

// ---------------------------------------------------------------------------
// Video modality types (POST /v1/video/t2v, /i2v, /v2v, /edits)
// ---------------------------------------------------------------------------

/** Pass as `duration` to match the source clip's length where the serving provider supports it. */
export const MATCH_SOURCE_DURATION = -1;

/** Video capability fields added to `ModelOut` and `ModelProviderOut`. */
export interface ModelVideoCapabilities {
  supports_t2v?: boolean;
  supports_i2v?: boolean;
  supports_v2v?: boolean;
  video_options?: Record<string, unknown> | null;
}

/** Combined video request body shared by the modality routes. */
export interface VideoModalityRequest {
  model: string;
  prompt?: string;
  /** Seconds, or `MATCH_SOURCE_DURATION` (-1). */
  duration?: number;
  /** Refused with 403 `tool_not_allowed` when the key's tool policy blocks `web_search`. */
  web_search?: boolean;
  [key: string]: unknown;
}

/** Async video task returned by a submit; poll it for the result. */
export interface VideoModalityTask {
  id?: string;
  status?: string;
  [key: string]: unknown;
}

/**
 * Modality-specific video submits. The route decides which capability the serving
 * model must hold; a model without it is refused with `422` before any provider call.
 */
export class VideoModalityResource {
  constructor(private readonly http: HttpClient) {}

  private submit(path: string, body: VideoModalityRequest): Promise<VideoModalityTask> {
    return this.http.request<VideoModalityTask>({ method: 'POST', path, body });
  }

  /** Text to video (`POST /v1/video/t2v`). Requires `supports_t2v`. */
  t2v(body: VideoModalityRequest): Promise<VideoModalityTask> {
    return this.submit('/v1/video/t2v', body);
  }

  /** Image to video (`POST /v1/video/i2v`). Requires `supports_i2v`. */
  i2v(body: VideoModalityRequest): Promise<VideoModalityTask> {
    return this.submit('/v1/video/i2v', body);
  }

  /** Video to video (`POST /v1/video/v2v`). Requires `supports_v2v`. */
  v2v(body: VideoModalityRequest): Promise<VideoModalityTask> {
    return this.submit('/v1/video/v2v', body);
  }

  /** Edit a video (`POST /v1/video/edits`). Not gated by a modality flag. */
  edits(body: VideoModalityRequest): Promise<VideoModalityTask> {
    return this.submit('/v1/video/edits', body);
  }
}
