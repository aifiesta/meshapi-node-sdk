import type { HttpClient } from '../http';

// ---------------------------------------------------------------------------
// Keys (GET /v1/keys/{key_id})
// ---------------------------------------------------------------------------

/** Per-model limits attached to an API key. */
export interface KeyModelLimits {
  [model: string]: Record<string, unknown>;
}

/** Effective limits for a key after every applicable tier is applied (the lowest value wins). */
export interface KeyEffectiveLimits {
  [limit: string]: unknown;
}

/**
 * Introspection payload for an API key.
 *
 * The key secret and its hash are never returned.
 */
export interface KeyDescription {
  /** The key id. */
  id: string;
  /** The organization that owns the key. */
  org_id?: string | null;
  /** Human-readable label, if one was set. */
  label?: string | null;
  /** Masked form of the key, safe to display. */
  masked_key?: string | null;
  /** Scopes granted to the key. */
  scopes?: string[];
  /** Models the key may call. Empty or null means no allow-list. */
  allowed_models?: string[] | null;
  /** Models the key may not call. */
  blocked_models?: string[] | null;
  /** Per-model limits. */
  model_limits?: KeyModelLimits | null;
  /** Effective limits for the key. */
  limits?: KeyEffectiveLimits | null;
  /** Any additional fields returned by the API. */
  [key: string]: unknown;
}

/**
 * Access to `/v1/keys`.
 */
export class KeysResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Describe an API key: its organization, scopes, model access and effective limits.
   *
   * Calls `GET /v1/keys/{key_id}`.
   *
   * - With a data-plane key (`rsk_...`), `keyId` must be the calling key's own id.
   *   Any other id returns `404`.
   * - With an admin key or user session holding `keys:read`, any key within the
   *   caller's scope can be read. A key outside that scope returns `403`.
   *
   * @param keyId - The id of the key to describe.
   * @returns The key description. The secret is never included.
   *
   * @example
   * ```ts
   * const key = await client.keys.retrieve('key_123');
   * console.log(key.scopes, key.allowed_models);
   * ```
   */
  async retrieve(keyId: string): Promise<KeyDescription> {
    if (!keyId) {
      throw new Error('keyId is required');
    }
    return this.http.get<KeyDescription>(`/v1/keys/${encodeURIComponent(keyId)}`);
  }
}
