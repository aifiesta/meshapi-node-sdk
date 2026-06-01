import type { HttpClient } from "../http.js";
import type {
  BulkEmbedRequest,
  BulkEmbedResponse,
  InitUploadRequest,
  InitUploadResponse,
  ListRagFilesParams,
  RagFileListResponse,
  RagFileStatus,
  RequestOptions,
  SearchRequest,
  SearchResponse,
} from "../types.js";

export class RagResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Initialise a RAG file upload.
   * Returns a signed URL — PUT your file bytes there, then call `embed()`.
   */
  initUpload(params: InitUploadRequest, opts?: RequestOptions): Promise<InitUploadResponse> {
    return this.http.post<InitUploadResponse>("/v1/files", params, opts);
  }

  /** List RAG files owned by the authenticated user. */
  list(params?: ListRagFilesParams, opts?: RequestOptions): Promise<RagFileListResponse> {
    const qs = new URLSearchParams();
    if (params?.limit != null) qs.set("limit", String(params.limit));
    if (params?.offset != null) qs.set("offset", String(params.offset));
    const path = qs.size > 0 ? `/v1/files?${qs}` : "/v1/files";
    return this.http.get<RagFileListResponse>(path, opts);
  }

  /** Get the current status of a single RAG file. */
  get(fileId: string, opts?: RequestOptions): Promise<RagFileStatus> {
    return this.http.get<RagFileStatus>(`/v1/files/${fileId}`, opts);
  }

  /**
   * Enqueue embedding jobs for one or more files.
   * Each file must have upload_status=ready and embedding_status=pending or failed.
   */
  embed(params: BulkEmbedRequest, opts?: RequestOptions): Promise<BulkEmbedResponse> {
    return this.http.post<BulkEmbedResponse>("/v1/files/embed", params, opts);
  }

  /** Perform a vector similarity search over embedded files. */
  search(params: SearchRequest, opts?: RequestOptions): Promise<SearchResponse> {
    return this.http.post<SearchResponse>("/v1/files/search", params, opts);
  }
}
