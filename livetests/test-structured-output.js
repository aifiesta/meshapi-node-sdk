import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MeshAPI } from "meshapi-node-sdk";
import { BASE_URL, TOKEN } from "./config.js";

const client = new MeshAPI({ baseUrl: BASE_URL, token: TOKEN });

const MODELS = [
  "openai/gpt-4o-mini",
  "google/gemini-3-flash-preview",
];

const countrySchema = {
  type: "json_schema",
  json_schema: {
    name: "country_info",
    schema: {
      type: "object",
      properties: {
        capital: { type: "string" },
        country: { type: "string" },
      },
      required: ["capital", "country"],
      additionalProperties: false,
    },
  },
};

const planetSchema = {
  type: "json_schema",
  json_schema: {
    name: "planet_info",
    schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        position_from_sun: { type: "integer" },
      },
      required: ["name", "position_from_sun"],
      additionalProperties: false,
    },
  },
};

for (const model of MODELS) {
  describe(`structured output [${model}]`, () => {
    it("returns valid JSON matching the schema", async () => {
      const resp = await client.chat.completions.create({
        model,
        messages: [{ role: "user", content: "What is the capital of France? Use the provided schema." }],
        response_format: countrySchema,
        max_tokens: 1000,
        temperature: 0,
      });

      assert.ok(resp.choices.length > 0, "expected choices");
      const content = resp.choices[0].message?.content;
      assert.ok(content, "expected non-empty content");

      const data = JSON.parse(content);
      assert.ok("capital" in data, `missing 'capital' field: ${JSON.stringify(data)}`);
      assert.ok("country" in data, `missing 'country' field: ${JSON.stringify(data)}`);
      assert.equal(typeof data.capital, "string", `'capital' must be a string: ${JSON.stringify(data)}`);
      assert.equal(typeof data.country, "string", `'country' must be a string: ${JSON.stringify(data)}`);
      assert.ok(data.capital.toLowerCase().includes("paris"), `expected Paris as capital: ${JSON.stringify(data)}`);
    });

    it("finish_reason is stop and response matches schema", async () => {
      const resp = await client.chat.completions.create({
        model,
        messages: [{ role: "user", content: "Name any planet in our solar system. Use the provided schema." }],
        response_format: planetSchema,
        max_tokens: 1000,
        temperature: 0,
      });

      assert.equal(resp.choices[0].finish_reason, "stop", `expected finish_reason 'stop', got ${resp.choices[0].finish_reason}`);
      const data = JSON.parse(resp.choices[0].message?.content ?? "{}");
      assert.ok("name" in data, `missing 'name' field: ${JSON.stringify(data)}`);
      assert.ok("position_from_sun" in data, `missing 'position_from_sun' field: ${JSON.stringify(data)}`);
      assert.equal(typeof data.position_from_sun, "number", `'position_from_sun' must be a number: ${JSON.stringify(data)}`);
    });
  });
}
