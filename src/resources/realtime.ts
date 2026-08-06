/**
 * Realtime resource — WSS /v1/realtime (bidirectional WebSocket session).
 *
 * Uses the global WebSocket (Node 22+ / browsers) with a fallback to the `ws`
 * package for Node 18–21. Auth is delivered via the `?api_key=` query string —
 * the only mechanism the gateway accepts. See {@link RealtimeResource.connect}.
 */

import { SDK_VERSION_HEADER, SDK_VERSION_VALUE } from "../http.js";
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
  } catch (err) {
    // Only a genuine resolution failure means `ws` is missing. Anything else —
    // a bundler shim, a broken install, an ESM/CJS interop fault — is a real
    // error and must not be disguised as "install ws", which sends people to
    // reinstall a package they already have.
    const code = (err as { code?: string } | undefined)?.code;
    const notInstalled = code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND";

    throw new Error(
      notInstalled
        ? "No WebSocket implementation found. On Node 18–21, install the `ws` package: npm install ws\n" +
          "Node 22+ and browsers have WebSocket built in."
        : `Failed to load the \`ws\` WebSocket transport: ${
            err instanceof Error ? err.message : String(err)
          }`,
      { cause: err },
    );
  }
}

// ── Session ───────────────────────────────────────────────────────────────────

function buildWSUrl(baseUrl: string, model: string, token: string): string {
  const base = baseUrl.replace(/\/$/, "").replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://");
  return `${base}/v1/realtime?model=${encodeURIComponent(model)}&api_key=${encodeURIComponent(token)}`;
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
  // null = clean close; Error (including RealtimeError) = abnormal termination.
  private _msgQueue: Array<RealtimeMessage | Error | null> = [];
  private _waiters: Array<(item: RealtimeMessage | Error | null) => void> = [];
  // Resolves when the onclose event fires — used by close() to await the handshake.
  private readonly _closedPromise: Promise<void>;
  private _resolveClose!: () => void;

  constructor(ws: AnyWebSocket) {
    this._ws = ws;
    this._closedPromise = new Promise<void>((resolve) => {
      this._resolveClose = resolve;
    });

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
      this._resolveClose();
    };

    ws.onerror = (ev) => {
      const err = ev instanceof Error ? ev : new Error(String(ev));
      this._errHandlers.forEach((h) => h(err));
      // Deliver the error into the iterator queue so for-await-of throws
      // rather than hanging indefinitely waiting for the next message.
      this._deliver(err);
    };
  }

  private _deliver(item: RealtimeMessage | Error | null): void {
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
    if (this._ws.readyState !== 1) {
      throw new Error(`Cannot send: WebSocket is not open (readyState=${this._ws.readyState})`);
    }
    this._ws.send(JSON.stringify(event));
  }

  /** Send raw audio bytes as a binary WebSocket frame. */
  async sendAudio(audio: Uint8Array): Promise<void> {
    if (this._ws.readyState !== 1) {
      throw new Error(`Cannot send: WebSocket is not open (readyState=${this._ws.readyState})`);
    }
    this._ws.send(audio);
  }

  /**
   * Close the WebSocket connection and wait for the close handshake to complete.
   * Awaiting this method guarantees that no further onmessage callbacks will fire.
   */
  async close(code = 1000, reason = ""): Promise<void> {
    if (this._ws.readyState === 3 /* CLOSED */) return;
    if (this._ws.readyState === 2 /* CLOSING */) return this._closedPromise;
    this._ws.close(code, reason);
    return this._closedPromise;
  }

  /**
   * Async iterator — yields RealtimeMessages until the connection closes.
   * Throws on server error envelopes (RealtimeError) and transport errors (Error).
   */
  async *[Symbol.asyncIterator](): AsyncGenerator<RealtimeMessage> {
    while (true) {
      const item = await new Promise<RealtimeMessage | Error | null>((resolve) => {
        const queued = this._msgQueue.shift();
        if (queued !== undefined) {
          resolve(queued);
        } else {
          this._waiters.push(resolve);
        }
      });

      if (item === null) return;   // clean close
      if (item instanceof Error) throw item;
      yield item;
    }
  }
}

// ── Resource ──────────────────────────────────────────────────────────────────

/** Provides access to the MeshAPI WebSocket realtime endpoint. */
export class RealtimeResource {
  private readonly _config: MeshAPIConfig;

  constructor(config: MeshAPIConfig) {
    this._config = config;
  }

  /**
   * Open a WebSocket session to the realtime endpoint for *model*.
   *
   * **Auth travels in the URL query string** (`?api_key=<token>`), because that
   * is the only mechanism the gateway currently accepts. Verified against
   * production: a raw `Sec-WebSocket-Protocol: openai-realtime, Bearer <token>`
   * header is rejected with HTTP 400, and an `Authorization: Bearer` header or a
   * space-free subprotocol variant both fail with `invalid_api_key`.
   *
   * Note that query strings are commonly recorded in proxy, load-balancer and
   * CDN access logs, so the key can end up in logs that are not treated as
   * secret storage. Moving auth to a header or subprotocol requires a
   * gateway-side change; it cannot be fixed in this SDK alone.
   *
   * ```ts
   * const session = await client.realtime.connect({ model: "openai/gpt-4o-realtime-preview" });
   * for await (const msg of session) {
   *   console.log(msg.event?.type);
   * }
   * ```
   */
  async connect(params: RealtimeConnectParams): Promise<RealtimeSession> {
    const wsUrl = buildWSUrl(this._config.baseUrl, params.model, this._config.token);

    // The subprotocol carries only the protocol name — the gateway reads the key
    // from the query string (see connect() docs for the verification matrix).
    // Subprotocol list sent as-is; the server echoes "openai-realtime".
    const subprotocols = ["openai-realtime"];

    // Extra headers — used by the `ws` Node fallback (browsers ignore them).
    const headers: Record<string, string> = {
      [SDK_VERSION_HEADER]: SDK_VERSION_VALUE,
    };

    const ws = await openWebSocket(wsUrl, subprotocols, headers);
    return new RealtimeSession(ws);
  }
}
