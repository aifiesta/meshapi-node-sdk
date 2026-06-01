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
  UploadFileParams,
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
    const path = qs.toString() ? `/v1/files?${qs}` : "/v1/files";
    return this.http.get<RagFileListResponse>(path, opts);
  }

  /** Get the current status of a single RAG file. */
  get(fileId: string, opts?: RequestOptions): Promise<RagFileStatus> {
    return this.http.get<RagFileStatus>(`/v1/files/${encodeURIComponent(fileId)}`, opts);
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

  /**
   * Convenience wrapper: calls `initUpload` then PUTs the file content to the
   * signed URL in one step. Returns the same `InitUploadResponse` so the caller
   * has the `file_id`.
   */
  async uploadFile(params: UploadFileParams, opts?: RequestOptions): Promise<InitUploadResponse> {
    // Build InitUploadRequest without undefined optional fields so that
    // exactOptionalPropertyTypes is satisfied.
    const initReq: InitUploadRequest = { file_name: params.file_name, mime_type: params.mime_type };
    if (params.embed !== undefined) initReq.embed = params.embed;
    if (params.metadata !== undefined) initReq.metadata = params.metadata;

    const upload = await this.initUpload(initReq, opts);

    const resp = await fetch(upload.signed_url, {
      method: "PUT",
      // Cast required: Uint8Array<ArrayBufferLike> vs BodyInit generic mismatch in strict TS.
      body: params.content as BodyInit,
      headers: { "Content-Type": params.mime_type },
    });

    if (!resp.ok) {
      throw new Error(`rag: PUT signed URL returned HTTP ${resp.status}`);
    }

    return upload;
  }
}
