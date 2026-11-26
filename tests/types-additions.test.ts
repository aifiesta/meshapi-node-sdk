import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mcpTool,
  isMcpTool,
  MCP_SERVERS_ORG_PERMISSIONS,
  type ImageFrameOptions,
  type VideoDimensionOptions,
  type WebSearchImageOptions,
  type WebSearchImageResults,
  type SearchModeOptions,
} from '../src/types-additions.ts';

test('mcpTool builds an mcp tool with require_approval never', () => {
  assert.deepEqual(mcpTool('docs'), {
    type: 'mcp',
    server_label: 'docs',
    require_approval: 'never',
  });
});

test('mcpTool rejects an empty label', () => {
  assert.throws(() => mcpTool(''), TypeError);
});

test('isMcpTool distinguishes mcp tools from function tools', () => {
  assert.equal(isMcpTool(mcpTool('docs')), true);
  assert.equal(isMcpTool({ type: 'function', name: 'f' }), false);
  assert.equal(isMcpTool({ type: 'mcp' }), false);
  assert.equal(isMcpTool(null), false);
});

test('mcp_servers permissions are listed', () => {
  assert.deepEqual([...MCP_SERVERS_ORG_PERMISSIONS], ['mcp_servers:read', 'mcp_servers:write']);
});

test('new request fields serialise as snake_case JSON', () => {
  const image: ImageFrameOptions = { frame_count: 4, frame_duration_ms: 120 };
  const video: VideoDimensionOptions = { width: 1280, height: 720 };
  const web: WebSearchImageOptions = { include_images: true, include_image_descriptions: true };
  const search: SearchModeOptions = { mode: 'fast' };
  assert.deepEqual(JSON.parse(JSON.stringify({ ...image, ...video, ...web, ...search })), {
    frame_count: 4,
    frame_duration_ms: 120,
    width: 1280,
    height: 720,
    include_images: true,
    include_image_descriptions: true,
    mode: 'fast',
  });
});

test('web search images parse with null, empty and populated values', () => {
  const notAsked: WebSearchImageResults = JSON.parse('{"images":null}');
  const none: WebSearchImageResults = JSON.parse('{"images":[]}');
  const some: WebSearchImageResults = JSON.parse(
    '{"images":[{"url":"https://example.com/a.png","title":"A","description":null}]}',
  );
  assert.equal(notAsked.images, null);
  assert.deepEqual(none.images, []);
  assert.equal(some.images?.[0]?.url, 'https://example.com/a.png');
  assert.equal(some.images?.[0]?.title, 'A');
});
