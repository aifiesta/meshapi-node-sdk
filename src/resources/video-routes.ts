import type { Transport } from './_transport.js';

// ---------------------------------------------------------------------------
// Video modality routes (t2v / i2v / v2v)
// ---------------------------------------------------------------------------

/**
 * Combined video generation body shared by `POST /v1/video/t2v`,
 * `POST /v1/video/i2v`, `POST /v1/video/v2v` and `POST /v1/video/edits`.
 *
 * The route decides which modality the serving model must support; the body
 * is the same on every route.
 */
export interface VideoGenerationRequest {
  /** Model id from `GET /v1/models`. */
  model: string;
  /** Text prompt describing the video. */
  prompt?: string;
  /** Clip length in seconds. `-1` asks supported providers to match the source clip. */
  duration?: number;
  /** Additional provider options accepted by the combined body. */
  [key: string]: unknown;
}

/** Async video task returned by a submit. Poll it until it reaches a terminal status. */
export interface VideoTask {
  id: string;
  status: string;
  model?: string;
  [key: string]: unknown;
}

/** Modality flags now reported on `ModelOut` and `ModelProviderOut`. */
export interface VideoModalityFlags {
  /** The model accepts `POST /v1/video/t2v`. */
  supports_t2v?: boolean;
  /** The model accepts `POST /v1/video/i2v`. */
  supports_i2v?: boolean;
  /** The model accepts `POST /v1/video/v2v`. */
  supports_v2v?: boolean;
  /** Video options the model or provider exposes. */
  video_options?: Record<string, unknown> | null;
}

export class VideoRoutesResource {
  constructor(private readonly http: Transport) {}

  /**
   * Submit a text-to-video task via `POST /v1/video/t2v`.
   *
   * A model without `supports_t2v` is refused with a `422` before any provider call.
   */
  textToVideo(body: VideoGenerationRequest): Promise<VideoTask> {
    return this.http.request<VideoTask>('POST', '/v1/video/t2v', { body });
  }

  /**
   * Submit an image-to-video task via `POST /v1/video/i2v`.
   *
   * A model without `supports_i2v` is refused with a `422` before any provider call.
   */
  imageToVideo(body: VideoGenerationRequest): Promise<VideoTask> {
    return this.http.request<VideoTask>('POST', '/v1/video/i2v', { body });
  }

  /**
   * Submit a video-to-video task via `POST /v1/video/v2v`.
   *
   * A model without `supports_v2v` is refused with a `422` before any provider call.
   */
  videoToVideo(body: VideoGenerationRequest): Promise<VideoTask> {
    return this.http.request<VideoTask>('POST', '/v1/video/v2v', { body });
  }

  /** Submit a video edit task via `POST /v1/video/edits`. */
  edit(body: VideoGenerationRequest): Promise<VideoTask> {
    return this.http.request<VideoTask>('POST', '/v1/video/edits', { body });
  }
}
