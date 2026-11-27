// Types added in API spec v1.0.439.
//
// These declarations are additive. Merge them into `src/types.ts` under the
// matching section comments and re-export them from `src/index.ts`.

// ---------------------------------------------------------------------------
// Images: animated frames
// ---------------------------------------------------------------------------

/**
 * Frame options for animated image output.
 *
 * Applies to `ImageGenerationRequest` and `ImageOptions`.
 */
export interface ImageFrameOptions {
  /** Number of frames to generate. */
  frame_count?: number | null;
  /** Duration of each frame, in milliseconds. */
  frame_duration_ms?: number | null;
}

// ---------------------------------------------------------------------------
// Video: output dimensions
// ---------------------------------------------------------------------------

/**
 * Output dimensions for video requests.
 *
 * Applies to `VideoGenerationRequest`, `VideoGenerateRequest` and `VideoEditRequest`.
 */
export interface VideoDimensions {
  /** Output width, in pixels. */
  width?: number | null;
  /** Output height, in pixels. */
  height?: number | null;
}

// ---------------------------------------------------------------------------
// Web search: images
// ---------------------------------------------------------------------------

/** Image options for `POST /v1/web/search` (`WebSearchRequest`). */
export interface WebSearchImageOptions {
  /** Return images found for the query in `images`. */
  include_images?: boolean | null;
  /** Add a description to each returned image. Requires `include_images`. */
  include_image_descriptions?: boolean | null;
}

/** One image returned by a web search. */
export interface WebSearchImage {
  url: string;
  title?: string | null;
  description?: string | null;
}

/** Image fields on `WebSearchResponse`. */
export interface WebSearchImageResult {
  /** `null` when images were not requested, `[]` when none were found. */
  images?: WebSearchImage[] | null;
}

// ---------------------------------------------------------------------------
// Search: mode
// ---------------------------------------------------------------------------

/** Mode field on `SearchRequest`. */
export interface SearchModeOption {
  /** Search mode to use. */
  mode?: string | null;
}

// ---------------------------------------------------------------------------
// Organisations: MCP server permissions
// ---------------------------------------------------------------------------

/** `OrgPermission` values added for MCP server management. */
export const MCP_SERVER_PERMISSIONS = ['mcp_servers:read', 'mcp_servers:write'] as const;

export type McpServerPermission = (typeof MCP_SERVER_PERMISSIONS)[number];

// ---------------------------------------------------------------------------
// Responses: MCP tool
// ---------------------------------------------------------------------------

/**
 * A tool backed by an MCP server registered to your organisation.
 *
 * Accepted in `ResponsesRequest.tools` alongside built-in and function tools.
 */
export interface McpTool {
  type: 'mcp';
  /** Label of a registered MCP server. */
  server_label: string;
  /** Approval mode for tool calls. */
  require_approval?: 'never';
}

/** Returns true when a tool entry is an `McpTool`. */
export function isMcpTool(tool: unknown): tool is McpTool {
  return (
    typeof tool === 'object' &&
    tool !== null &&
    (tool as { type?: unknown }).type === 'mcp' &&
    typeof (tool as { server_label?: unknown }).server_label === 'string'
  );
}
