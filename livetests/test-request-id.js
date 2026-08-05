import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MeshAPI } from "meshapi-node-sdk";
import { BASE_URL, TOKEN, MODEL } from "./config.js";

const client = new MeshAPI({ baseUrl: BASE_URL, token: TOKEN });

describe("request ids", () => {
  it("echoes a client-supplied requestId on the response _request_id", async () => {
    const customId = `node-sdk-livetest-${Date.now()}`;
    const resp = await client.chat.completions.create(
      {
        model: MODEL,
        messages: [{ role: "user", content: "What is 2 + 2? Reply in one word." }],
        max_tokens: 10,
        temperature: 0,
      },
      { requestId: customId },
    );
    assert.equal(resp._request_id, customId, "expected server to echo the client X-Request-Id");
    assert.ok(resp.choices.length > 0, "expected choices");
  });

  it("server mints a req_<ULID> id when no requestId is set", async () => {
    const resp = await client.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: "What is 2 + 2? Reply in one word." }],
      max_tokens: 10,
      temperature: 0,
    });
    assert.ok(resp._request_id, "expected _request_id to be populated");
    assert.match(resp._request_id, /^req_/, "expected server-minted id to start with req_");
  });

  it("_request_id is non-enumerable — JSON.stringify output is unchanged", async () => {
    const resp = await client.chat.completions.create(
      {
        model: MODEL,
        messages: [{ role: "user", content: "What is 2 + 2? Reply in one word." }],
        max_tokens: 10,
        temperature: 0,
      },
      { requestId: `node-sdk-enum-${Date.now()}` },
    );
    assert.ok(!JSON.stringify(resp).includes("_request_id"));
    assert.ok(!Object.keys(resp).includes("_request_id"));
  });

  it("error responses carry err.requestId", async () => {
    const customId = `node-sdk-err-${Date.now()}`;
    try {
      await client.chat.completions.create(
        {
          model: "definitely/not-a-real-model",
          messages: [{ role: "user", content: "hi" }],
          max_tokens: 5,
        },
        { requestId: customId },
      );
      assert.fail("expected an error for an unknown model");
    } catch (err) {
      assert.equal(err.requestId, customId, "expected error envelope to echo the request id");
    }
  });
});
