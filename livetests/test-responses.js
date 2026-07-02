import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MeshAPI, MeshAPIApiError } from "meshapi-node-sdk";
import { BASE_URL, TOKEN } from "./config.js";

const client = new MeshAPI({ baseUrl: BASE_URL, token: TOKEN });

describe("responses list/get", () => {
  it("list returns an OpenAI list envelope", async () => {
    const page = await client.responses.list({ limit: 5 });
    if (page.object !== undefined) assert.equal(page.object, "list");
    assert.ok(Array.isArray(page.data));
    assert.ok(page.data.length <= 5);
    for (const item of page.data) assert.ok(item.id, "each job must have an id");
  });

  it("get on an unknown id raises a structured 400/404", async () => {
    await assert.rejects(
      () => client.responses.get("resp_does_not_exist_000000000000"),
      (err) => err instanceof MeshAPIApiError && [400, 404].includes(err.status),
    );
  });
});
