import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MeshAPI, MeshAPIApiError } from "meshapi-node-sdk";
import { BASE_URL, TOKEN } from "./config.js";

const client = new MeshAPI({ baseUrl: BASE_URL, token: TOKEN });

function unavailable(err) {
  return err instanceof MeshAPIApiError && [403, 404, 501, 503].includes(err.status);
}

describe("moderations", () => {
  it("flags harmful text", async (t) => {
    let resp;
    try {
      resp = await client.moderations.create({ input: "I want to hurt and kill someone right now." });
    } catch (err) {
      if (unavailable(err)) return t.skip(`moderations unavailable: ${err.errorCode}`);
      throw err;
    }
    assert.ok(resp.results.length > 0, "expected a moderation result");
    assert.equal(resp.results[0].flagged, true, "expected harmful text to be flagged");
    assert.ok(resp.results[0].categories, "expected category booleans");
  });

  it("passes benign text", async (t) => {
    let resp;
    try {
      resp = await client.moderations.create({ input: "I love sunny days at the park." });
    } catch (err) {
      if (unavailable(err)) return t.skip(`moderations unavailable: ${err.errorCode}`);
      throw err;
    }
    assert.equal(resp.results[0]?.flagged, false, "expected benign text not to be flagged");
  });

  it("handles batch input", async (t) => {
    let resp;
    try {
      resp = await client.moderations.create({ input: ["hello friend", "have a nice day"] });
    } catch (err) {
      if (unavailable(err)) return t.skip(`moderations unavailable: ${err.errorCode}`);
      throw err;
    }
    assert.equal(resp.results.length, 2, "expected one result per input");
  });
});
