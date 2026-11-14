import type { HttpClient } from '../http.js';

// ---------------------------------------------------------------------------
// Video modality routes (/v1/video/t2v, /i2v, /v2v, /edits)
// ---------------------------------------------------------------------------

/** Combined video request body shared by every video submit route. */
export interface VideoModalityRequest {
  model: string;
  prompt?: string;
  [key: string]: unknown;
}

/** Async video task returned on submit. Poll it until it reaches a terminal status. */
export interface VideoModalityTask {
  id: string;
  status: string;
  [key: string]: unknown;
}

/** Video capability fields now present on `ModelOut` and `ModelProviderOut`. */
export interface ModelVideoCapabilities {
  supports_t2v?: boolean;
  supports_i2v?: boolean;
  supports_v2v?: boolean;
  video_options?: Record<string, unknown> | null;
}

/**
 * Submit video tasks by input role.
 *
 * The route decides which capability the serving model must hold
 * (`supports_t2v`, `supports_i2v` or `supports_v2v` on `GET /v1/models`).
 * A model without it is refused with a 422.
 */
export class VideoModalityResource {
  constructor(private readonly http: HttpClient) {}

  /** `POST /v1/video/t2v` — generate a video from text. */
  t2v(body: VideoModalityRequest): Promise<VideoModalityTask> {
    return this.http.request<VideoModalityTask>('POST', '/v1/video/t2v', { body });
  }

  /** `POST /v1/video/i2v` — generate a video from an image. */
  i2v(body: VideoModalityRequest): Promise<VideoModalityTask> {
    return this.http.request<VideoModalityTask>('POST', '/v1/video/i2v', { body });
  }

  /** `POST /v1/video/v2v` — generate a video from a source video. */
  v2v(body: VideoModalityRequest): Promise<VideoModalityTask> {
    return this.http.request<VideoModalityTask>('POST', '/v1/video/v2v', { body });
  }

  /** `POST /v1/video/edits` — edit an existing video. */
  edits(body: VideoModalityRequest): Promise<VideoModalityTask> {
    return this.http.request<VideoModalityTask>('POST', '/v1/video/edits', { body });
  }
}
