import type { HttpClient } from "../http.js";
import type { RequestOptions } from "../types.js";
import type {
  CreateVideoGenerationResponse,
  VideoGenerationParams,
  VideoTaskResponse,
} from "../types.js";

export class VideosResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Submit a video generation task.
   *
   * Returns immediately with `{ id }`. Poll {@link get} until `status` is
   * `succeeded`, `failed`, or `expired`.
   */
  create(
    params: VideoGenerationParams,
    opts?: RequestOptions,
  ): Promise<CreateVideoGenerationResponse> {
    return this.http.post<CreateVideoGenerationResponse>("/v1/video/generations", params, opts);
  }

  /**
   * Retrieve the current status (and result) of a video generation task.
   *
   * When `status === "succeeded"`, `content.video_url` is populated.
   */
  get(taskId: string, opts?: RequestOptions): Promise<VideoTaskResponse> {
    return this.http.get<VideoTaskResponse>(`/v1/video/generations/${taskId}`, opts);
  }
}
