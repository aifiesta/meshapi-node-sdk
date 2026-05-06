import type { HttpClient } from "../http.js";
import type { FileObject, RequestOptions, UploadBatchFileParams } from "../types.js";

export class FilesResource {
  constructor(private readonly http: HttpClient) {}

  upload(params: UploadBatchFileParams, opts?: RequestOptions): Promise<FileObject> {
    return this.http.post<FileObject>("/v1/files", params, opts);
  }

  get(fileId: string, opts?: RequestOptions): Promise<FileObject> {
    return this.http.get<FileObject>(`/v1/files/${fileId}`, opts);
  }

  delete(fileId: string, opts?: RequestOptions): Promise<void> {
    return this.http.delete(`/v1/files/${fileId}`, opts);
  }

  content(fileId: string, opts?: RequestOptions): Promise<Uint8Array> {
    return this.http.getBytes(`/v1/files/${fileId}/content`, opts);
  }
}
