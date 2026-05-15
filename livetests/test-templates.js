import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MeshAPI, MeshAPIApiError } from "meshapi-node-sdk";
import { BASE_URL, TOKEN } from "./config.js";

const client = new MeshAPI({ baseUrl: BASE_URL, token: TOKEN });

describe("templates", () => {
  it("full CRUD lifecycle", async () => {
    const name = `node-livetest-${Date.now()}`;
    let templateId = null;

    try {
      // create
      const tmpl = await client.templates.create({
        name,
        description: "Node SDK live test template",
        system: "You are a helpful assistant.",
        variables: ["topic"],
      });
      templateId = tmpl.id;
      assert.ok(tmpl.id, "expected template id");
      assert.ok(tmpl.owner, "expected template owner");
      assert.equal(tmpl.name, name);

      // list — created template must appear
      const all = await client.templates.list();
      assert.ok(all.some(t => t.id === templateId), "created template not found in list");

      // get
      const got = await client.templates.get(templateId);
      assert.equal(got.id, templateId);
      assert.equal(got.name, name);

      // update
      const updated = await client.templates.update(templateId, {
        description: "Updated by Node SDK live test",
      });
      assert.equal(updated.description, "Updated by Node SDK live test");

      // delete
      await client.templates.delete(templateId);
      templateId = null;

      // verify 404 after delete
      await assert.rejects(
        () => client.templates.get(tmpl.id),
        (err) => {
          assert.ok(err instanceof MeshAPIApiError, "expected MeshAPIApiError");
          assert.equal(err.status, 404);
          return true;
        },
      );
    } finally {
      if (templateId) {
        await client.templates.delete(templateId).catch(() => {});
      }
    }
  });
});
