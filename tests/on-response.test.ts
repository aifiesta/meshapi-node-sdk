/**
 * onResponse hook tests — verify the request id from `x-request-id` is surfaced
 * on successful responses, not only on errors. No live server required.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

import { MeshAPI, MeshAPIApiError } from "../src/index.js";
import { SDK_VERSION_VALUE } from "../src/http.js";
import type { ResponseInfo } from "../src/index.js";

const BASE = "https://api.meshapi.test";
const TOKEN = "rsk_test";

function jsonResponse(body: unknown, requestId?: string, status = 200): Response {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (requestId) headers["x-request-id"] = requestId;
  return new Response(JSON.stringify(body), { status, headers });
}

function sseResponse(payloads: unknown[], requestId?: string): Response {
  const text = payloads
    .map((p) => `data: ${typeof p === "string" ? p : JSON.stringify(p)}\n\n`)
    .join("");
  const headers: Record<string, string> = { "content-type": "text/event-stream" };
  if (requestId) headers["x-request-id"] = requestId;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode(text));
      c.close();
    },
  });
  return new Response(stream, { status: 200, headers });
}

/** Client whose fetch is stubbed, collecting every onResponse call. */
function harness(fetchImpl: typeof fetch, onResponse?: (i: ResponseInfo) => void) {
  const seen: ResponseInfo[] = [];
  const client = new MeshAPI({
    baseUrl: BASE,
    token: TOKEN,
    maxRetries: 0,
    fetch: fetchImpl,
    onResponse: (info) => {
      seen.push(info);
      onResponse?.(info);
    },
  });
  return { client, seen };
}

const CHAT_OK = {
  id: "chatcmpl-1",
  model: "openai/gpt-4o-mini",
  choices: [{ index: 0, message: { role: "assistant", content: "hi" }, finish_reason: "stop" }],
};

describe("onResponse: successful requests", () => {
  it("reports the request id for a non-streaming completion", async () => {
    const { client, seen } = harness(async () => jsonResponse(CHAT_OK, "req_01SUCCESS"));

    await client.chat.completions.create({
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: "hi" }],
    });

    assert.equal(seen.length, 1);
    assert.equal(seen[0].requestId, "req_01SUCCESS");
    assert.equal(seen[0].status, 200);
    assert.equal(seen[0].method, "POST");
    assert.match(seen[0].url, /\/v1\/chat\/completions$/);
    assert.equal(typeof seen[0].durationMs, "number");
    assert.ok(seen[0].durationMs >= 0);
  });

  it("reports the request id for a GET", async () => {
    const { client, seen } = harness(async () => jsonResponse([], "req_01MODELS"));
    await client.models.list();

    assert.equal(seen.length, 1);
    assert.equal(seen[0].requestId, "req_01MODELS");
    assert.equal(seen[0].method, "GET");
  });

  it("fires for a streaming request as soon as headers arrive", async () => {
    const { client, seen } = harness(async () =>
      sseResponse([{ choices: [{ delta: { content: "hi" } }] }, "[DONE]"], "req_01STREAM"),
    );

    const stream = client.chat.completions.create({
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: "hi" }],
      stream: true,
    });

    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);

    assert.equal(chunks.length, 1);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].requestId, "req_01STREAM");
  });

  it("leaves requestId undefined when the header is absent", async () => {
    const { client, seen } = harness(async () => jsonResponse(CHAT_OK));
    await client.chat.completions.create({
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: "hi" }],
    });

    assert.equal(seen.length, 1);
    assert.equal(seen[0].requestId, undefined);
  });
});

describe("onResponse: failures and retries", () => {
  it("still fires on an error response, alongside MeshAPIApiError.requestId", async () => {
    const { client, seen } = harness(async () =>
      jsonResponse(
        { error: { code: "unauthorized", message: "bad key" }, request_id: "req_01FAIL" },
        "req_01FAIL",
        401,
      ),
    );

    await assert.rejects(
      () => client.models.list(),
      (err: unknown) => err instanceof MeshAPIApiError && err.requestId === "req_01FAIL",
    );

    assert.equal(seen.length, 1);
    assert.equal(seen[0].status, 401);
    assert.equal(seen[0].requestId, "req_01FAIL");
  });

  it("fires once per attempt when a request is retried", async () => {
    let call = 0;
    const seen: ResponseInfo[] = [];

    const client = new MeshAPI({
      baseUrl: BASE,
      token: TOKEN,
      maxRetries: 3,
      fetch: async () => {
        call++;
        return call === 1
          ? jsonResponse(
              { error: { code: "upstream_error", message: "transient" }, request_id: "req_01RETRY1" },
              "req_01RETRY1",
              503,
            )
          : jsonResponse([], "req_01RETRY2");
      },
      onResponse: (info) => seen.push(info),
    });

    await client.models.list();

    // One hook call per network attempt, so a retried request is visible as two.
    assert.equal(call, 2);
    assert.equal(seen.length, 2);
    assert.equal(seen[0].requestId, "req_01RETRY1");
    assert.equal(seen[0].status, 503);
    assert.equal(seen[1].requestId, "req_01RETRY2");
    assert.equal(seen[1].status, 200);
  });
});

describe("X-MeshAPI-SDK version header", () => {
  const pkgVersion = () => {
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
    return (JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string }).version;
  };

  it("the shared constant matches package.json", () => {
    // Covers both consumers of the constant: HttpClient and RealtimeResource.
    assert.equal(
      SDK_VERSION_VALUE,
      `node/${pkgVersion()}`,
      "SDK_VERSION_VALUE in src/http.ts is out of sync with package.json",
    );
  });

  it("is sent on outgoing requests", async () => {
    const version = pkgVersion();

    let sent: Record<string, string> | undefined;
    const client = new MeshAPI({
      baseUrl: BASE,
      token: TOKEN,
      fetch: async (_input, init) => {
        sent = init?.headers as Record<string, string>;
        return jsonResponse([]);
      },
    });
    await client.models.list();

    assert.equal(
      sent?.["X-MeshAPI-SDK"],
      `node/${version}`,
      "SDK_VERSION_VALUE in src/http.ts is out of sync with package.json",
    );
  });
});

describe("onResponse: safety", () => {
  it("a throwing hook does not break the request", async () => {
    const client = new MeshAPI({
      baseUrl: BASE,
      token: TOKEN,
      fetch: async () => jsonResponse(CHAT_OK, "req_01THROW"),
      onResponse: () => {
        throw new Error("logging blew up");
      },
    });

    const reply = await client.chat.completions.create({
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: "hi" }],
    });

    assert.equal(reply.choices[0].message?.content, "hi");
  });

  it("a rejecting async hook does not break the request or leak an unhandled rejection", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);

    try {
      const client = new MeshAPI({
        baseUrl: BASE,
        token: TOKEN,
        fetch: async () => jsonResponse(CHAT_OK, "req_01ASYNCTHROW"),
        // An async hook whose promise rejects. A plain synchronous try/catch
        // around the call would not catch this, and the rejection would surface
        // as an unhandledRejection — which can terminate the process.
        onResponse: async () => {
          throw new Error("async logging blew up");
        },
      });

      const reply = await client.chat.completions.create({
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "hi" }],
      });
      assert.equal(reply.choices[0].message?.content, "hi");

      // Unhandled rejections are reported on a later turn of the microtask
      // queue, so give the loop a chance to surface one before asserting.
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.deepEqual(unhandled, [], "hook rejection must not escape as an unhandled rejection");
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("an async hook is not awaited, so it cannot delay the response", async () => {
    let hookSettled = false;
    const client = new MeshAPI({
      baseUrl: BASE,
      token: TOKEN,
      fetch: async () => jsonResponse(CHAT_OK, "req_01ASYNCSLOW"),
      onResponse: async () => {
        await new Promise((resolve) => setTimeout(resolve, 300));
        hookSettled = true;
      },
    });

    await client.chat.completions.create({
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: "hi" }],
    });

    assert.equal(hookSettled, false, "the response must not wait for a slow async hook");
  });

  it("omitting the hook leaves behaviour unchanged", async () => {
    const client = new MeshAPI({
      baseUrl: BASE,
      token: TOKEN,
      fetch: async () => jsonResponse(CHAT_OK, "req_01NOHOOK"),
    });

    const reply = await client.chat.completions.create({
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: "hi" }],
    });

    assert.equal(reply.choices[0].message?.content, "hi");
  });
});
