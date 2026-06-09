import type { HttpClient } from "../http.js";
import type {
  CreateVideoGenerationResponse,
  ListVideoGenerationsParams,
  RequestOptions,
  VideoGenerationParams,
  VideoTaskListResponse,
  VideoTaskResponse,
} from "../types.js";

export class VideosResource {
  constructor(private readonly http: HttpClient) {}

  /** POST /v1/video/generations — submit a video generation task. */
  generate(params: VideoGenerationParams, opts?: RequestOptions): Promise<CreateVideoGenerationResponse> {
    return this.http.post<CreateVideoGenerationResponse>("/v1/video/generations", params, opts);
  }

  /** GET /v1/video/generations — list video generation tasks. */
  list(params?: ListVideoGenerationsParams, opts?: RequestOptions): Promise<VideoTaskListResponse> {
    const query = new URLSearchParams();
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) {
          query.set(k, String(v));
        }
      }
    }
    const qs = query.toString();
    return this.http.get<VideoTaskListResponse>(
      qs ? `/v1/video/generations?${qs}` : "/v1/video/generations",
      opts,
    );
  }

  /** GET /v1/video/generations/{task_id} — get a single video generation task. */
  retrieve(taskId: string, opts?: RequestOptions): Promise<VideoTaskResponse> {
    return this.http.get<VideoTaskResponse>(`/v1/video/generations/${taskId}`, opts);
  }
}
