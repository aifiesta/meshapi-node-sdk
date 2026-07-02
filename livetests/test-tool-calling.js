import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MeshAPI, MeshAPIApiError } from "meshapi-node-sdk";
import { BASE_URL, TOKEN, MODEL } from "./config.js";

const client = new MeshAPI({ baseUrl: BASE_URL, token: TOKEN });

const weatherTool = {
  type: "function",
  function: {
    name: "get_weather",
    description: "Get the current weather for a city.",
    parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
  },
};

function toolsUnsupported(err) {
  return (
    err instanceof MeshAPIApiError &&
    [400, 501].includes(err.status) &&
    ["not_implemented", "model_capability_not_supported"].includes(err.errorCode)
  );
}

describe("tool calling", () => {
  it("round-trip: forced tool call, then final answer", async (t) => {
    const messages = [{ role: "user", content: "What is the weather in Paris?" }];
    let resp;
    try {
      resp = await client.chat.completions.create({
        model: MODEL,
        messages,
        tools: [weatherTool],
        // Force the call so the round-trip is deterministic.
        tool_choice: { type: "function", function: { name: "get_weather" } },
        max_tokens: 100,
      });
    } catch (err) {
      if (toolsUnsupported(err)) return t.skip(`model does not support tool calling: ${err.errorCode}`);
      throw err;
    }

    const msg = resp.choices[0]?.message;
    assert.ok(msg?.tool_calls?.length, "forced tool_choice must produce a tool_calls array");
    const call = msg.tool_calls[0];
    assert.ok(call.id, "tool call must have an id");
    assert.equal(call.function.name, "get_weather");
    const args = JSON.parse(call.function.arguments); // must be valid JSON
    assert.ok("city" in args, "expected a 'city' argument");

    messages.push({ role: "assistant", content: msg.content, tool_calls: msg.tool_calls });
    messages.push({
      role: "tool",
      tool_call_id: call.id,
      content: '{"temperature": 22, "unit": "celsius", "description": "Sunny"}',
    });

    const final = await client.chat.completions.create({
      model: MODEL,
      messages,
      tools: [weatherTool],
      max_tokens: 100,
    });
    assert.ok(final.choices[0]?.message?.content, "expected a final answer after the tool result");
  });

  it("auto tool_choice is well-formed", async (t) => {
    let resp;
    try {
      resp = await client.chat.completions.create({
        model: MODEL,
        messages: [{ role: "user", content: "What is the weather in Tokyo?" }],
        tools: [weatherTool],
        tool_choice: "auto",
        max_tokens: 100,
      });
    } catch (err) {
      if (toolsUnsupported(err)) return t.skip(`model does not support tool calling: ${err.errorCode}`);
      throw err;
    }
    const msg = resp.choices[0]?.message;
    if (msg?.tool_calls?.length) {
      for (const call of msg.tool_calls) {
        assert.ok(call.id && call.function.name, "tool call must be well-formed");
        JSON.parse(call.function.arguments); // must be valid JSON
      }
    } else {
      assert.ok(msg?.content, "if no tool was called, the model must reply with content");
    }
  });
});
