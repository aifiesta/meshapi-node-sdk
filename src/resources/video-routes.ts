import type { HttpClient } from '../http.js';
import type { VideoModalityRequest, VideoModalityTask } from '../video-routes-types.js';

/**
 * Submit video requests by input type.
 *
 * Each route refuses a model that lacks the matching capability with a `422`
 * before any provider call. Check `supports_t2v`, `supports_i2v` and
 * `supports_v2v` on `GET /v1/models` first.
 *
 * @example
 * ```ts
 * const task = await client.videoRoutes.textToVideo({ model: videoModelId, prompt: 'A red kite over the sea' });
 * ```
 */
export class VideoRoutesResource {
  constructor(private readonly http: HttpClient) {}

  private submit(path: string, body: VideoModalityRequest): Promise<VideoModalityTask> {
    return this.http.request<VideoModalityTask>('POST', path, { body });
  }

  /** Generate a video from text (`POST /v1/video/t2v`). */
  textToVideo(body: VideoModalityRequest): Promise<VideoModalityTask> {
    return this.submit('/v1/video/t2v', body);
  }

  /** Generate a video from an input image (`POST /v1/video/i2v`). */
  imageToVideo(body: VideoModalityRequest): Promise<VideoModalityTask> {
    return this.submit('/v1/video/i2v', body);
  }

  /** Generate a video from an input video (`POST /v1/video/v2v`). */
  videoToVideo(body: VideoModalityRequest): Promise<VideoModalityTask> {
    return this.submit('/v1/video/v2v', body);
  }

  /** Edit an existing video (`POST /v1/video/edits`). */
  edit(body: VideoModalityRequest): Promise<VideoModalityTask> {
    return this.submit('/v1/video/edits', body);
  }
}
