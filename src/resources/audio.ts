import type { HttpClient } from "../http.js";
import type {
  ListVoicesParams,
  RequestOptions,
  SpeechParams,
  TranscriptionParams,
  TranscriptionResponse,
  TranscriptionTranslateParams,
  Voice,
  VoicesResponse,
} from "../types.js";

export class AudioResource {
  constructor(private readonly http: HttpClient) {}

  /** POST /v1/audio/speech — returns raw audio bytes. */
  synthesize(params: SpeechParams, opts?: RequestOptions): Promise<Uint8Array> {
    return this.http.postBytes("/v1/audio/speech", params, opts);
  }

  /** POST /v1/audio/transcriptions — multipart upload. */
  transcribe(
    file: Uint8Array | Buffer,
    params: TranscriptionParams,
    opts?: RequestOptions & { filename?: string },
  ): Promise<TranscriptionResponse> {
    const { filename = "audio.mp3", ...reqOpts } = opts ?? {};
    const fields: Record<string, string | string[]> = {};
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) {
        fields[k] = Array.isArray(v) ? (v as string[]) : String(v);
      }
    }
    return this.http.postMultipart<TranscriptionResponse>(
      "/v1/audio/transcriptions",
      fields,
      { name: filename, data: file },
      reqOpts,
    );
  }

  /** GET /v1/audio/transcriptions/{transcription_id} */
  getTranscription(transcriptionId: string, opts?: RequestOptions): Promise<unknown> {
    return this.http.get(`/v1/audio/transcriptions/${transcriptionId}`, opts);
  }

  /** POST /v1/audio/transcriptions/translate — multipart, translates to English. */
  translate(
    file: Uint8Array | Buffer,
    params?: TranscriptionTranslateParams,
    opts?: RequestOptions & { filename?: string },
  ): Promise<TranscriptionResponse> {
    const { filename = "audio.mp3", ...reqOpts } = opts ?? {};
    const fields: Record<string, string> = {};
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) {
          fields[k] = String(v);
        }
      }
    }
    return this.http.postMultipart<TranscriptionResponse>(
      "/v1/audio/transcriptions/translate",
      fields,
      { name: filename, data: file },
      reqOpts,
    );
  }

  /** GET /v1/audio/voices */
  listVoices(params?: ListVoicesParams, opts?: RequestOptions): Promise<VoicesResponse> {
    const query = new URLSearchParams();
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) {
          if (Array.isArray(v)) {
            for (const item of v) query.append(k, String(item));
          } else {
            query.set(k, String(v));
          }
        }
      }
    }
    const qs = query.toString();
    return this.http.get(qs ? `/v1/audio/voices?${qs}` : "/v1/audio/voices", opts);
  }

  /** GET /v1/audio/voices/{voice_id} */
  getVoice(voiceId: string, opts?: RequestOptions): Promise<Voice> {
    return this.http.get(`/v1/audio/voices/${voiceId}`, opts);
  }
}
