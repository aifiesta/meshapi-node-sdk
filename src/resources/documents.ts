import type { HttpClient } from "../http.js";
import type {
  DocumentListResponse,
  DocumentResponse,
  GenerateDocumentRequest,
  ListDocumentsParams,
  RequestOptions,
} from "../types.js";

export class DocumentsResource {
  constructor(private readonly http: HttpClient) {}

  /** POST /v1/documents/generate — generate a new document. */
  generate(params: GenerateDocumentRequest, opts?: RequestOptions): Promise<DocumentResponse> {
    return this.http.post<DocumentResponse>("/v1/documents/generate", params, opts);
  }

  /** GET /v1/documents — list generated documents. */
  list(params?: ListDocumentsParams, opts?: RequestOptions): Promise<DocumentListResponse> {
    const query = new URLSearchParams();
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) {
          query.set(k, String(v));
        }
      }
    }
    const qs = query.toString();
    return this.http.get<DocumentListResponse>(
      qs ? `/v1/documents?${qs}` : "/v1/documents",
      opts,
    );
  }

  /** GET /v1/documents/{document_id} — retrieve a single document. */
  retrieve(documentId: string, opts?: RequestOptions): Promise<DocumentResponse> {
    return this.http.get<DocumentResponse>(
      `/v1/documents/${encodeURIComponent(documentId)}`,
      opts,
    );
  }
}
