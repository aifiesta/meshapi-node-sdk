// ---------------------------------------------------------------------------
// Spec v1.0.440 additions
//
// Additive, non-breaking types introduced in spec v1.0.440. They are written
// to merge into the matching interfaces in `src/types.ts`; until then they can
// be intersected with the existing request/response types.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Images: animated output
// ---------------------------------------------------------------------------

/**
 * Frame options for animated image generation.
 *
 * Added to both `ImageGenerationRequest` and `ImageOptions`.
 */
export interface ImageFrameOptions {
  /** Number of frames to generate for an animated image. */
  frame_count?: number | null;
  /** Display duration of each frame, in milliseconds. */
  frame_duration_ms?: number | null;
}

// ---------------------------------------------------------------------------
// Video: output dimensions
// ---------------------------------------------------------------------------

/**
 * Output dimensions for video generation and editing.
 *
 * Added to `VideoGenerationRequest`, `VideoGenerateRequest` and `VideoEditRequest`.
 */
export interface VideoDimensions {
  /** Output width in pixels. */
  width?: number | null;
  /** Output height in pixels. */
  height?: number | null;
}

// ---------------------------------------------------------------------------
// Web search: images
// ---------------------------------------------------------------------------

/** Image options added to `WebSearchRequest`. */
export interface WebSearchImageOptions {
  /** Return images found for the query in `images`. */
  include_images?: boolean | null;
  /** Return a description for each image. Requires `include_images: true`. */
  include_image_descriptions?: boolean | null;
}

/** One image returned by a web search. */
export interface WebSearchImage {
  url: string;
  title?: string | null;
  description?: string | null;
}

/** Field added to `WebSearchResponse`. */
export interface WebSearchImagesResult {
  /**
   * Images found for the query. `null` when `include_images` was not set,
   * an empty array when none were found.
   */
  images?: WebSearchImage[] | null;
}

// ---------------------------------------------------------------------------
// Search: mode
// ---------------------------------------------------------------------------

/** Field added to `SearchRequest`. */
export interface SearchModeOption {
  /** Search mode to use for this request. */
  mode?: string | null;
}

// ---------------------------------------------------------------------------
// Responses: MCP tools
// ---------------------------------------------------------------------------

/**
 * A tool that exposes the tools of an MCP server registered for your
 * organization. Accepted in `ResponsesRequest.tools` alongside built-in and
 * function tools.
 */
export interface McpTool {
  type: 'mcp';
  /** Label of the registered MCP server. */
  server_label: string;
  /** Approval policy for tool calls. */
  require_approval?: 'never' | string;
}

/** Type guard for `McpTool` entries in `ResponsesRequest.tools`. */
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

/** `OrgPermission` values added in v1.0.440. */
export type McpServerOrgPermission = 'mcp_servers:read' | 'mcp_servers:write';

export const MCP_SERVER_ORG_PERMISSIONS: readonly McpServerOrgPermission[] = [
  'mcp_servers:read',
  'mcp_servers:write',
] as const;
