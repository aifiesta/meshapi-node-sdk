// ---------------------------------------------------------------------------
// Spec v1.0.436 additions
//
// Additive, non-breaking fields introduced in API spec v1.0.436. These types
// are intended to be merged into the matching interfaces in `src/types.ts`
// and re-exported from `src/index.ts`.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Images: animated output
// ---------------------------------------------------------------------------

/**
 * Frame options for animated image output.
 *
 * Applies to `POST /v1/images/generations` (`ImageGenerationRequest`) and to
 * the `image` options block on chat requests (`ImageOptions`).
 */
export interface ImageFrameOptions {
  /** Number of frames to generate for an animated image. */
  frame_count?: number | null;
  /** Display duration of each frame, in milliseconds. */
  frame_duration_ms?: number | null;
}

// ---------------------------------------------------------------------------
// Videos: output dimensions
// ---------------------------------------------------------------------------

/**
 * Output dimensions for video requests.
 *
 * Applies to `VideoGenerationRequest`, `VideoGenerateRequest` and
 * `VideoEditRequest`.
 */
export interface VideoDimensionOptions {
  /** Output video width, in pixels. */
  width?: number | null;
  /** Output video height, in pixels. */
  height?: number | null;
}

// ---------------------------------------------------------------------------
// Web search: images
// ---------------------------------------------------------------------------

/**
 * Image options for `POST /v1/web/search` (`WebSearchRequest`).
 *
 * Setting `include_image_descriptions` without `include_images` is rejected
 * with a 422. Image requests cannot be combined with a pinned `native` or
 * `tinyfish` engine (also a 422).
 */
export interface WebSearchImageOptions {
  /** Return images related to the query in `WebSearchResponse.images`. */
  include_images?: boolean | null;
  /** Add a `description` to each returned image. Requires `include_images`. */
  include_image_descriptions?: boolean | null;
}

/** One image returned by `POST /v1/web/search`. */
export interface WebSearchImage {
  /** Image URL. */
  url: string;
  /** Image title, when the source provides one. */
  title?: string | null;
  /** Image description, when `include_image_descriptions` is set. */
  description?: string | null;
}

/**
 * Image results on `WebSearchResponse`.
 *
 * `images` is `null` when images were not requested and `[]` when none were
 * found.
 */
export interface WebSearchImageResults {
  images?: WebSearchImage[] | null;
}

// ---------------------------------------------------------------------------
// Search: mode
// ---------------------------------------------------------------------------

/**
 * `mode` field on `SearchRequest`.
 *
 * A mode that is not enabled for the caller is refused with the error code
 * `search_mode_not_enabled`.
 */
export interface SearchModeOptions {
  /** Search mode to use. */
  mode?: string | null;
}

// ---------------------------------------------------------------------------
// Responses: MCP tools
// ---------------------------------------------------------------------------

/**
 * A tool that exposes a registered MCP server to the model on
 * `POST /v1/responses`.
 *
 * `ResponsesRequest.tools` now accepts `BuiltinTool | McpTool |
 * ResponsesFunctionTool`. The server is referenced by its registered
 * `server_label`; MeshAPI runs the tool calls and returns the final answer.
 * `require_approval` must be `"never"`.
 */
export interface McpTool {
  type: 'mcp';
  /** Label of an MCP server registered for your organization. */
  server_label: string;
  /** Approval policy for tool calls. Only `"never"` is accepted. */
  require_approval?: 'never';
}

/**
 * Builds an `McpTool` entry for `ResponsesRequest.tools`.
 *
 * @example
 * ```ts
 * const tools = [mcpTool('docs')];
 * ```
 */
export function mcpTool(serverLabel: string): McpTool {
  if (typeof serverLabel !== 'string' || serverLabel.length === 0) {
    throw new TypeError('mcpTool: serverLabel must be a non-empty string');
  }
  return { type: 'mcp', server_label: serverLabel, require_approval: 'never' };
}

/** Returns `true` when a `ResponsesRequest.tools` entry is an `McpTool`. */
export function isMcpTool(tool: unknown): tool is McpTool {
  return (
    typeof tool === 'object' &&
    tool !== null &&
    (tool as { type?: unknown }).type === 'mcp' &&
    typeof (tool as { server_label?: unknown }).server_label === 'string'
  );
}

// ---------------------------------------------------------------------------
// Organizations: permissions
// ---------------------------------------------------------------------------

/** `OrgPermission` values added for managing MCP servers. */
export type McpServersOrgPermission = 'mcp_servers:read' | 'mcp_servers:write';

/** All `OrgPermission` values added in v1.0.436. */
export const MCP_SERVERS_ORG_PERMISSIONS: readonly McpServersOrgPermission[] = [
  'mcp_servers:read',
  'mcp_servers:write',
] as const;
