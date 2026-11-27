import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MCP_SERVER_PERMISSIONS,
  isMcpTool,
  type ImageFrameOptions,
  type McpTool,
  type SearchModeOption,
  type VideoDimensions,
  type WebSearchImageOptions,
  type WebSearchImageResult,
} from '../src/spec-v1.0.439.js';

test('image frame options serialise as snake_case fields', () => {
  const opts: ImageFrameOptions = { frame_count: 8, frame_duration_ms: 120 };
  assert.deepEqual(JSON.parse(JSON.stringify(opts)), { frame_count: 8, frame_duration_ms: 120 });
});

test('video dimensions serialise width and height', () => {
  const dims: VideoDimensions = { width: 1280, height: 720 };
  assert.deepEqual(JSON.parse(JSON.stringify(dims)), { width: 1280, height: 720 });
});

test('web search image options and results round-trip', () => {
  const req: WebSearchImageOptions = { include_images: true, include_image_descriptions: true };
  assert.deepEqual(JSON.parse(JSON.stringify(req)), req);

  const res: WebSearchImageResult = JSON.parse(
    '{"images":[{"url":"https://example.com/a.png","title":"A","description":"An image"}]}',
  );
  assert.equal(res.images?.length, 1);
  assert.equal(res.images?.[0]?.url, 'https://example.com/a.png');

  const notAsked: WebSearchImageResult = JSON.parse('{"images":null}');
  assert.equal(notAsked.images, null);
});

test('search mode is passed through', () => {
  const req: SearchModeOption = { mode: 'fast' };
  assert.equal(JSON.parse(JSON.stringify(req)).mode, 'fast');
});

test('mcp server permissions list both values', () => {
  assert.deepEqual([...MCP_SERVER_PERMISSIONS], ['mcp_servers:read', 'mcp_servers:write']);
});

test('isMcpTool recognises MCP tools only', () => {
  const tool: McpTool = { type: 'mcp', server_label: 'docs', require_approval: 'never' };
  assert.equal(isMcpTool(tool), true);
  assert.equal(isMcpTool({ type: 'function', name: 'f' }), false);
  assert.equal(isMcpTool({ type: 'mcp' }), false);
  assert.equal(isMcpTool(null), false);
});
