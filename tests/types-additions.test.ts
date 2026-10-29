import { test } from "node:test";
import assert from "node:assert/strict";
import {
  costLineQuantity,
  type AnthropicMessagesRequestAdditions,
  type ChatCompletionRequestAdditions,
  type CostLineOut,
  type UsageFilterAdditions,
} from "../src/types-additions.js";

test("chat request serialises max_completion_tokens and provider", () => {
  const body: ChatCompletionRequestAdditions = {
    max_completion_tokens: 256,
    provider: { order: ["openai"] },
  };
  assert.deepEqual(JSON.parse(JSON.stringify(body)), {
    max_completion_tokens: 256,
    provider: { order: ["openai"] },
  });
});

test("messages request accepts container, mcp_servers and service_tier", () => {
  const body: AnthropicMessagesRequestAdditions = {
    container: "container_123",
    mcp_servers: [{ type: "url", url: "https://example.com/mcp", name: "example" }],
    service_tier: "auto",
  };
  const parsed = JSON.parse(JSON.stringify(body));
  assert.equal(parsed.mcp_servers[0].name, "example");
  assert.equal(parsed.service_tier, "auto");
});

test("cost line without tokens is valid and reports quantity", () => {
  const line: CostLineOut = {
    quantity: 5,
    unit: "per_second",
    rate_usd: "0.05",
    charged: true,
    tokens: null,
    rate_per_1m_usd: null,
  };
  assert.equal(costLineQuantity(line), 5);
});

test("token-only cost line falls back to tokens", () => {
  const line: CostLineOut = { tokens: 1200, rate_per_1m_usd: "0.15" };
  assert.equal(costLineQuantity(line), 1200);
});

test("cost line with no quantity returns null", () => {
  assert.equal(costLineQuantity({}), null);
});

test("usage filter carries the new fields", () => {
  const filter: UsageFilterAdditions = {
    provider: ["openai"],
    is_byok: false,
    stream: true,
    is_retry_attempt: [true, false],
  };
  assert.deepEqual(JSON.parse(JSON.stringify(filter)).is_retry_attempt, [true, false]);
});
