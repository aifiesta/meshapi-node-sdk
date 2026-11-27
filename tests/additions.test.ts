import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  isMcpTool,
  MCP_SERVER_ORG_PERMISSIONS,
  type ImageFrameOptions,
  type McpTool,
  type VideoDimensions,
  type WebSearchImageOptions,
  type WebSearchImagesResult,
  type SearchModeOption,
} from '../src/additions';

test('image frame options serialise as snake_case fields', () => {
  const opts: ImageFrameOptions = { frame_count: 8, frame_duration_ms: 120 };
  assert.deepEqual(JSON.parse(JSON.stringify(opts)), {
    frame_count: 8,
    frame_duration_ms: 120,
  });
});

test('video dimensions serialise width and height', () => {
  const dims: VideoDimensions = { width: 1280, height: 720 };
  assert.deepEqual(JSON.parse(JSON.stringify(dims)), { width: 1280, height: 720 });
});

test('web search image options and response images', () => {
  const req: WebSearchImageOptions = { include_images: true, include_image_descriptions: true };
  assert.equal(req.include_images, true);

  const res: WebSearchImagesResult = JSON.parse(
    '{"images":[{"url":"https://example.com/a.png","title":"A","description":"An image"}]}',
  );
  assert.equal(res.images?.length, 1);
  assert.equal(res.images?.[0].url, 'https://example.com/a.png');

  const none: WebSearchImagesResult = JSON.parse('{"images":null}');
  assert.equal(none.images, null);
});

test('search mode is optional', () => {
  const empty: SearchModeOption = {};
  assert.equal(empty.mode, undefined);
});

test('isMcpTool recognises MCP tools', () => {
  const tool: McpTool = { type: 'mcp', server_label: 'docs', require_approval: 'never' };
  assert.equal(isMcpTool(tool), true);
  assert.equal(isMcpTool({ type: 'function', name: 'f' }), false);
  assert.equal(isMcpTool({ type: 'mcp' }), false);
  assert.equal(isMcpTool(null), false);
});

test('MCP server org permissions', () => {
  assert.deepEqual([...MCP_SERVER_ORG_PERMISSIONS], ['mcp_servers:read', 'mcp_servers:write']);
});
