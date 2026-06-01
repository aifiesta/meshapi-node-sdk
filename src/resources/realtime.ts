/**
 * Realtime resource — WSS /v1/realtime (bidirectional WebSocket session).
 *
 * Uses the global WebSocket (Node 22+ / browsers) with a fallback to the `ws`
 * package for Node 18–21. Auth is delivered via the Sec-WebSocket-Protocol
 * header per the MeshAPI wire contract.
 */

import type { MeshAPIConfig } from "../http.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Parameters for opening a realtime session. */
export interface RealtimeConnectParams {
  /** Realtime-capable model ID, e.g. "openai/gpt-4o-realtime-preview". */
  model: string;
}

/** A single frame received from the server. Exactly one of text or audio is set. */
export interface RealtimeMessage {
  /** Raw JSON string for text frames. */
  text?: string;
  /** Raw audio bytes for binary frames. */
  audio?: Uint8Array;
  /** Parsed JSON object for text frames; undefined for audio. */
  event?: Record<string, unknown>;
}

/** Delivered by the server inside a {"type":"error",...} text frame. */
export class RealtimeError extends Error {
  /** Snake_case error code, e.g. "invalid_api_key", "insufficient_quota". */
  readonly code: string;
  /** Offending parameter, if any. */
  readonly param: string | undefined;
  /** Server-assigned request ID for log correlation. */
  readonly requestId: string | undefined;

  constructor(opts: { code: string; message: string; param?: string; requestId?: string }) {
    super(`realtime[${opts.code}]: ${opts.message}`);
    this.name = "RealtimeError";
    this.code = opts.code;
    this.param = opts.param;
    this.requestId = opts.requestId;
  }
}

// ── WebSocket bootstrap ───────────────────────────────────────────────────────

type AnyWebSocket = {
  onmessage: ((ev: { data: string | Buffer | ArrayBuffer | Buffer[] }) => void) | null;
  onclose: ((ev: { code: number; reason: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  send(data: string | Uint8Array): void;
  close(code?: number, reason?: string): void;
  readonly readyState: number;
};

async function openWebSocket(url: string, subprotocols: string[], headers: Record<string, string>): Promise<AnyWebSocket> {
  // Prefer global WebSocket (Node 22+, browsers).
  if (typeof globalThis.WebSocket !== "undefined") {
    return new Promise<AnyWebSocket>((resolve, reject) => {
      // The global WebSocket API does not support custom headers on the initial
      // handshake in browsers. We encode auth in the subprotocol list instead,
      // which is fully supported and is the primary auth method in the spec.
      const ws = new globalThis.WebSocket(url, subprotocols) as unknown as AnyWebSocket;
      const tempOpen = () => { resolve(ws); };
      const tempError = (ev: unknown) => { reject(ev); };
      (ws as unknown as EventTarget).addEventListener("open", tempOpen, { once: true });
      (ws as unknown as EventTarget).addEventListener("error", tempError, { once: true });
    });
  }

  // Fallback: try the `ws` package (Node 18–21).
  try {
    const { WebSocket: WS } = await import("ws") as { WebSocket: new (url: string, protocols: string[], opts: unknown) => AnyWebSocket };
    return new Promise<AnyWebSocket>((resolve, reject) => {
      const ws = new WS(url, subprotocols, { headers });
      (ws as unknown as EventTarget).addEventListener("open", () => resolve(ws), { once: true });
      (ws as unknown as EventTarget).addEventListener("error", (ev: unknown) => reject(ev), { once: true });
    });
  } catch {
    throw new Error(
      "No WebSocket implementation found. On Node 18–21, install the `ws` package: npm install ws\n" +
      "Node 22+ and browsers have WebSocket built in."
    );
  }
}

// ── Session ───────────────────────────────────────────────────────────────────

function buildWSUrl(baseUrl: string, model: string): string {
  const base = baseUrl.replace(/\/$/, "").replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://");
  return `${base}/v1/realtime?model=${encodeURIComponent(model)}`;
}

function parseFrame(data: string | Buffer | ArrayBuffer | Buffer[] | Uint8Array): RealtimeMessage {
  if (typeof data !== "string") {
    // Binary frame — audio.
    let bytes: Uint8Array;
    if (data instanceof ArrayBuffer) {
      bytes = new Uint8Array(data);
    } else if (data instanceof Uint8Array) {
      bytes = data;
    } else if (Array.isArray(data)) {
      // ws sends Buffer[]
      bytes = new Uint8Array(Buffer.concat(data as Buffer[]));
    } else {
      // Node Buffer
      bytes = new Uint8Array(data as unknown as Buffer);
    }
    return { audio: bytes };
  }
  try {
    const evt = JSON.parse(data) as Record<string, unknown>;
    return { text: data, event: evt };
  } catch {
    return { text: data };
  }
}

function checkErrorEnvelope(msg: RealtimeMessage): void {
  if (msg.event?.type === "error") {
    const err = (msg.event.error ?? {}) as Record<string, string>;
    throw new RealtimeError({
      code: err.code ?? "unknown",
      message: err.message ?? "realtime error",
      ...(err.param !== undefined && { param: err.param }),
      ...(msg.event.request_id !== undefined && { requestId: msg.event.request_id as string }),
    });
  }
}

/**
 * Active WebSocket session with the MeshAPI realtime endpoint.
 *
 * Supports both callback (EventEmitter-style) and async-iterator consumption.
 *
 * ```ts
 * const session = await client.realtime.connect({ model: "openai/gpt-4o-realtime-preview" });
 *
 * // Callback style
 * session.on("message", (msg) => console.log(msg.event));
 * session.on("error",   (err) => console.error(err));
 * session.on("close",   ()    => console.log("done"));
 *
 * // Async iterator style
 * for await (const msg of session) {
 *   console.log(msg.event?.type);
 * }
 * ```
 */
export class RealtimeSession {
  private readonly _ws: AnyWebSocket;
  private _msgHandlers: Array<(msg: RealtimeMessage) => void> = [];
  private _errHandlers: Array<(err: RealtimeError | Error) => void> = [];
  private _closeHandlers: Array<(code: number, reason: string) => void> = [];
  private _msgQueue: Array<RealtimeMessage | RealtimeError | null> = []; // null = close
  private _waiters: Array<(item: RealtimeMessage | RealtimeError | null) => void> = [];

  constructor(ws: AnyWebSocket) {
    this._ws = ws;

    ws.onmessage = (ev) => {
      let msg: RealtimeMessage;
      try {
        msg = parseFrame(ev.data as string | Buffer | ArrayBuffer | Buffer[]);
      } catch {
        return;
      }

      // Check for error envelope — deliver as error, not message.
      if (msg.event?.type === "error") {
        const err = (msg.event.error ?? {}) as Record<string, string>;
        const re = new RealtimeError({
          code: err.code ?? "unknown",
          message: err.message ?? "realtime error",
          ...(err.param !== undefined && { param: err.param }),
          ...(msg.event.request_id !== undefined && { requestId: msg.event.request_id as string }),
        });
        this._errHandlers.forEach((h) => h(re));
        this._deliver(re);
        return;
      }

      this._msgHandlers.forEach((h) => h(msg));
      this._deliver(msg);
    };

    ws.onclose = (ev) => {
      this._closeHandlers.forEach((h) => h(ev.code, ev.reason));
      this._deliver(null);
    };

    ws.onerror = (ev) => {
      const err = ev instanceof Error ? ev : new Error(String(ev));
      this._errHandlers.forEach((h) => h(err));
    };
  }

  private _deliver(item: RealtimeMessage | RealtimeError | null): void {
    const waiter = this._waiters.shift();
    if (waiter) {
      waiter(item);
    } else {
      this._msgQueue.push(item);
    }
  }

  /** Register a callback for incoming messages. Chainable. */
  on(event: "message", handler: (msg: RealtimeMessage) => void): this;
  on(event: "error", handler: (err: RealtimeError | Error) => void): this;
  on(event: "close", handler: (code: number, reason: string) => void): this;
  on(
    event: string,
    handler: ((msg: RealtimeMessage) => void) | ((err: RealtimeError | Error) => void) | ((code: number, reason: string) => void),
  ): this {
    switch (event) {
      case "message": this._msgHandlers.push(handler as (msg: RealtimeMessage) => void); break;
      case "error":   this._errHandlers.push(handler as (err: RealtimeError | Error) => void); break;
      case "close":   this._closeHandlers.push(handler as (code: number, reason: string) => void); break;
    }
    return this;
  }

  /** Send a JSON event as a text WebSocket frame. */
  async send(event: Record<string, unknown>): Promise<void> {
    this._ws.send(JSON.stringify(event));
  }

  /** Send raw audio bytes as a binary WebSocket frame. */
  async sendAudio(audio: Uint8Array): Promise<void> {
    this._ws.send(audio);
  }

  /** Close the WebSocket connection. */
  async close(code = 1000, reason = ""): Promise<void> {
    this._ws.close(code, reason);
  }

  /**
   * Async iterator — yields RealtimeMessages until the connection closes.
   * Re-throws RealtimeError for server error envelopes.
   */
  async *[Symbol.asyncIterator](): AsyncGenerator<RealtimeMessage> {
    while (true) {
      const item = await new Promise<RealtimeMessage | RealtimeError | null>((resolve) => {
        const queued = this._msgQueue.shift();
        if (queued !== undefined) {
          resolve(queued);
        } else {
          this._waiters.push(resolve);
        }
      });

      if (item === null) return;          // connection closed
      if (item instanceof RealtimeError) throw item;
      yield item;
    }
  }
}

// ── Resource ──────────────────────────────────────────────────────────────────

const SDK_VERSION_HEADER = "X-MeshAPI-SDK";
const SDK_VERSION_VALUE = "node/0.1.0";

/** Provides access to the MeshAPI WebSocket realtime endpoint. */
export class RealtimeResource {
  private readonly _config: MeshAPIConfig;

  constructor(config: MeshAPIConfig) {
    this._config = config;
  }

  /**
   * Open a WebSocket session to the realtime endpoint for *model*.
   *
   * Auth is sent via `Sec-WebSocket-Protocol: openai-realtime, Bearer <token>`,
   * matching the MeshAPI wire contract exactly.
   *
   * ```ts
   * const session = await client.realtime.connect({ model: "openai/gpt-4o-realtime-preview" });
   * for await (const msg of session) {
   *   console.log(msg.event?.type);
   * }
   * ```
   */
  async connect(params: RealtimeConnectParams): Promise<RealtimeSession> {
    const wsUrl = buildWSUrl(this._config.baseUrl, params.model);

    // Primary auth: Sec-WebSocket-Protocol header.
    // Subprotocol list sent as-is; the server echoes "openai-realtime".
    const subprotocols = ["openai-realtime", `Bearer ${this._config.token}`];

    // Extra headers — used by the `ws` Node fallback (browsers ignore them).
    const headers: Record<string, string> = {
      [SDK_VERSION_HEADER]: SDK_VERSION_VALUE,
    };

    const ws = await openWebSocket(wsUrl, subprotocols, headers);
    return new RealtimeSession(ws);
  }
}
