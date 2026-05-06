import { parseJSONSSEStream } from "../http.js";
import type { HttpClient } from "../http.js";
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
  ): AsyncIterable<CompareStreamEvent>;
  create(
    params: CompareParams,
    opts?: RequestOptions,
  ): Promise<CompareResponse> | AsyncIterable<CompareStreamEvent> {
    if (params.stream === true) {
      return this.streamCreate(params, opts);
    }
    return this.http.post<CompareResponse>("/v1/chat/compare", params, opts);
  }

  private streamCreate(
    params: CompareParams,
    opts?: RequestOptions,
  ): AsyncIterable<CompareStreamEvent> {
    const http = this.http;
    return {
      [Symbol.asyncIterator](): AsyncIterator<CompareStreamEvent> {
        let iterator: AsyncIterator<CompareStreamEvent> | null = null;

        const init = async (): Promise<AsyncIterator<CompareStreamEvent>> => {
          const response = await http.stream("/v1/chat/compare", params, opts);
          const gen = parseJSONSSEStream<CompareStreamEvent>(response);
          return gen[Symbol.asyncIterator]();
        };

        return {
          async next() {
            if (!iterator) iterator = await init();
            return iterator.next();
          },
          async return(value?: unknown) {
            if (iterator?.return) return iterator.return(value);
            return { done: true, value: undefined as unknown as CompareStreamEvent };
          },
          async throw(err?: unknown) {
            if (iterator?.throw) return iterator.throw(err);
            throw err;
          },
        };
      },
    };
  }
}
