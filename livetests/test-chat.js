import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MeshAPI } from "meshapi-node-sdk";
import { BASE_URL, TOKEN, MODEL } from "./config.js";

const client = new MeshAPI({ baseUrl: BASE_URL, token: TOKEN });

describe("chat completions (non-streaming)", () => {
  it("basic completion returns assistant message", async () => {
    const resp = await client.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: "What is 2 + 2? Reply in one word." }],
      max_tokens: 10,
      temperature: 0,
    });
    assert.ok(resp.id, "expected response id");
    assert.ok(resp.model, "expected model field");
    assert.ok(resp.choices.length > 0, "expected choices");
    assert.equal(resp.choices[0].message?.role, "assistant");
    assert.ok(resp.choices[0].message?.content, "expected non-empty content");
    assert.ok(resp.usage != null, "expected usage");
  });

  it("multi-turn conversation uses prior context", async () => {
    const resp = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "user", content: "My favourite color is blue. Remember this." },
        { role: "assistant", content: "Got it! Your favourite color is blue." },
        { role: "user", content: "What is my favourite color? Reply in 3 words max." },
      ],
      max_tokens: 20,
      temperature: 0,
    });
    assert.ok(resp.choices[0].message?.content, "expected non-empty multi-turn response");
    assert.ok(["stop", "length"].includes(resp.choices[0].finish_reason ?? ""), "expected valid finish_reason");
  });

  it("chat with template applies system prompt from template", async () => {
    const name = `node-chat-tpl-${Date.now()}`;
    const tmpl = await client.templates.create({
      name,
      system: "You are a {{role}}. Always reply in exactly one sentence.",
      variables: ["role"],
    });
    try {
      const resp = await client.chat.completions.create({
        model: MODEL,
        messages: [{ role: "user", content: "Introduce yourself." }],
        template: tmpl.name,
        variables: { role: "friendly pirate" },
        max_tokens: 80,
        temperature: 0,
      });
      assert.ok(resp.choices[0].message?.content, "expected non-empty templated response");
    } finally {
      await client.templates.delete(tmpl.id).catch(() => {});
    }
  });
});
