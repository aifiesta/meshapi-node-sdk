import { makeLazySSEIterable } from "../http.js";
import type { HttpClient, SSEStream } from "../http.js";
import type {
  CompareParams,
  CompareResponse,
  CompareStreamEvent,
  RequestOptions,
} from "../types.js";

export class CompareResource {
  constructor(private readonly http: HttpClient) {}

  create(
    params: CompareParams & { stream?: false },
    opts?: RequestOptions,
  ): Promise<CompareResponse>;
  create(
    params: CompareParams & { stream: true },
    opts?: RequestOptions,
  ): SSEStream<CompareStreamEvent>;
  /**
   * Fallback overload for a `CompareParams` whose `stream` is a plain
   * `boolean` — i.e. built at runtime rather than as a literal. Without it the
   * exported `CompareParams` type matches neither of the overloads above and
   * cannot be passed to this method at all. `chat` and `responses` already
   * carry the equivalent overload.
   */
  create(
    params: CompareParams,
    opts?: RequestOptions,
  ): Promise<CompareResponse> | SSEStream<CompareStreamEvent>;
  create(
    params: CompareParams,
    opts?: RequestOptions,
  ): Promise<CompareResponse> | SSEStream<CompareStreamEvent> {
    if (params.stream === true) {
      return this.streamCreate(params, opts);
    }
    return this.http.post<CompareResponse>("/v1/chat/compare", params, opts);
  }

  private streamCreate(
    params: CompareParams,
    opts?: RequestOptions,
  ): SSEStream<CompareStreamEvent> {
    // Was a hand-rolled duplicate of makeLazySSEIterable's machinery, which
    // meant it silently missed `requestId`. Sharing the factory keeps every
    // streaming surface on one implementation.
    return makeLazySSEIterable<CompareStreamEvent>(this.http, "/v1/chat/compare", params, opts);
  }
}
