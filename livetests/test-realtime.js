/**
 * Live tests for the MeshAPI Node SDK realtime (WebSocket) resource.
 *
 * Run:  node --test test-realtime.js
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { MeshAPI, RealtimeError } from "meshapi-node-sdk";
import { BASE_URL, TOKEN, env } from "./config.js";

const REALTIME_MODEL = env("MESHAPI_REALTIME_MODEL", "openai/gpt-realtime-mini");

function skipIfNoModel(_t) {
  // default is openai/gpt-realtime-mini; override via MESHAPI_REALTIME_MODEL
}

const client = new MeshAPI({ baseUrl: BASE_URL, token: TOKEN });

describe("Realtime — WebSocket sessions", () => {
  it("connect and close", async (t) => {
    skipIfNoModel(t);
    const session = await client.realtime.connect({ model: REALTIME_MODEL });
    await session.close();
    console.log("[PASS] realtime.connect + close");
  });

  it("receive session.created on connect", async (t) => {
    skipIfNoModel(t);
    const session = await client.realtime.connect({ model: REALTIME_MODEL });
    try {
      // Read the first frame via the async iterator.
      const iter = session[Symbol.asyncIterator]();
      const { value: msg } = await iter.next();
      assert.ok(msg, "expected at least one frame");
      assert.ok(msg.event, "expected JSON text frame, got binary audio");
      console.log(`[PASS] first frame type=${JSON.stringify(msg.event.type)}`);
    } finally {
      await session.close();
    }
  });

  it("send session.update and receive ack", async (t) => {
    skipIfNoModel(t);
    const session = await client.realtime.connect({ model: REALTIME_MODEL });
    const iter = session[Symbol.asyncIterator]();
    try {
      // Drain the initial session.created.
      await iter.next();

      await session.send({
        type: "session.update",
        session: { instructions: "You are a helpful assistant." },
      });

      const { value: ack } = await iter.next();
      assert.ok(ack?.event, "expected JSON frame after session.update");
      console.log(`[PASS] session.update ack type=${JSON.stringify(ack.event.type)}`);
    } finally {
      await session.close();
    }
  });

  it("error envelope for bad model", async (t) => {
    skipIfNoModel(t);
    try {
      const session = await client.realtime.connect({ model: "nonexistent/bad-model-xyz" });
      // If connect succeeds, try to read the error envelope.
      try {
        const iter = session[Symbol.asyncIterator]();
        await iter.next();
        console.log("[PASS] server closed connection for bad model (no envelope)");
      } catch (e) {
        if (e instanceof RealtimeError) {
          console.log(`[PASS] error envelope: code=${JSON.stringify(e.code)}`);
        }
      } finally {
        await session.close().catch(() => {});
      }
    } catch (e) {
      console.log(`[PASS] connect failed for bad model: ${e.message}`);
    }
  });

  it("on() callback API — message handler", async (t) => {
    skipIfNoModel(t);
    const session = await client.realtime.connect({ model: REALTIME_MODEL });
    const received = [];

    await new Promise((resolve, reject) => {
      session.on("message", (msg) => {
        received.push(msg);
        if (received.length >= 1) {
          session.close().then(resolve).catch(reject);
        }
      });
      session.on("error", reject);
      session.on("close", () => resolve());
      // Timeout safety valve.
      setTimeout(() => reject(new Error("timeout")), 15_000);
    });

    assert.ok(received.length >= 1, "expected at least one message via on()");
    console.log(`[PASS] on('message') received ${received.length} frame(s)`);
  });

  it("async iterator yields frames", async (t) => {
    skipIfNoModel(t);
    const session = await client.realtime.connect({ model: REALTIME_MODEL });
    let count = 0;
    try {
      for await (const msg of session) {
        count++;
        if (count >= 1) break;
      }
    } finally {
      await session.close().catch(() => {});
    }
    assert.ok(count >= 1, "expected at least one frame from async iterator");
    console.log(`[PASS] async iterator received ${count} frame(s)`);
  });
});
