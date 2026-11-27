# Release v1.0.437

## Endpoints changed

- POST /v1/moderations -> 404

## Schemas changed

- ImageGenerationRequest.frame_count
- ImageGenerationRequest.frame_duration_ms
- ImageOptions.frame_count
- ImageOptions.frame_duration_ms
- OrgPermission: 'mcp_servers:read'
- OrgPermission: 'mcp_servers:write'
- ResponsesRequest.tools: anyOf[array[anyOf[#/components/schemas/BuiltinTool, #/components/schemas/ResponsesFunctionTool]], null] -> anyOf[array[anyOf[#/components/schemas/BuiltinTool, #/components/schemas/McpTool, #/components/schemas/ResponsesFunctionTool]], null]
- SearchRequest.mode
- VideoEditRequest.height
- VideoEditRequest.width
- VideoGenerateRequest.height
- VideoGenerateRequest.width
- VideoGenerationRequest.height
- VideoGenerationRequest.width
- WebSearchRequest.include_image_descriptions
- WebSearchRequest.include_images
- WebSearchResponse.images

_STUB: this is a generated placeholder; full reference, changelog and SDK content is produced by a later automated step._
