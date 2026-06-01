import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MeshAPI } from "meshapi-node-sdk";
import { BASE_URL, TOKEN } from "./config.js";

const client = new MeshAPI({ baseUrl: BASE_URL, token: TOKEN });

/** Document uploaded in every RAG live test — contains a unique searchable phrase. */
const RAG_TEST_CONTENT =
  "MeshAPI SDK live test document.\n" +
  "This file is used to verify RAG upload, embedding, and vector search.\n" +
  'The document contains the unique phrase "meshapi rag livetest node" ' +
  "so search results are deterministic.\n";

const MIME_TYPE = "text/plain";
const MAX_EMBED_WAIT_MS = 90_000;

/** PUT raw bytes to a signed URL using the global fetch API. */
async function putFile(signedUrl, content, mimeType) {
  const resp = await fetch(signedUrl, {
    method: "PUT",
    body: content,
    headers: { "Content-Type": mimeType },
  });
  assert.ok(resp.ok, `PUT signed URL returned HTTP ${resp.status}`);
}

/** Sleep for a given number of milliseconds. */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Poll until embedding_status reaches "ready"; throws on "failed" or timeout. */
async function pollEmbedding(fileId) {
  const deadline = Date.now() + MAX_EMBED_WAIT_MS;
  while (Date.now() < deadline) {
    const s = await client.rag.get(fileId);
    console.log(`  polling embedding_status=${s.embedding_status} for file ${fileId}`);
    if (s.embedding_status === "ready") return;
    if (s.embedding_status === "failed") {
      throw new Error(`embedding failed for ${fileId}: error_code=${s.last_error_code}`);
    }
    await sleep(3_000);
  }
  throw new Error(`embedding did not reach 'ready' within ${MAX_EMBED_WAIT_MS}ms for ${fileId}`);
}

describe("rag", () => {
  it("upload, embed, and search lifecycle", async () => {
    const fileName = `node-livetest-${Date.now()}.txt`;

    // ── Step 1: InitUpload (embed=false to test the embed endpoint explicitly) ──
    const upload = await client.rag.initUpload({
      file_name: fileName,
      mime_type: MIME_TYPE,
      embed: false,
    });
    assert.ok(upload.file_id, "expected file_id");
    assert.ok(upload.signed_url, "expected signed_url");
    console.log(`[PASS] rag.initUpload → file_id=${upload.file_id}`);

    // ── Step 2: PUT file content to signed URL ──
    await putFile(upload.signed_url, RAG_TEST_CONTENT, MIME_TYPE);
    console.log("[PASS] PUT file content to signed URL");

    // ── Step 3: Poll until upload_status=ready ──
    const uploadDeadline = Date.now() + 30_000;
    let uploadReady = false;
    while (Date.now() < uploadDeadline) {
      const s = await client.rag.get(upload.file_id);
      if (s.upload_status === "ready") {
        uploadReady = true;
        console.log(`[PASS] rag.get → upload_status=${s.upload_status} embedding_status=${s.embedding_status}`);
        break;
      }
      await sleep(2_000);
    }
    assert.ok(uploadReady, "upload_status did not reach 'ready' within 30s");

    // ── Step 4: Embed ──
    const embedResp = await client.rag.embed({ file_ids: [upload.file_id] });
    assert.ok(embedResp.results.length > 0, "embed returned no results");
    console.log(`[PASS] rag.embed → status=${embedResp.results[0].embedding_status}`);

    // ── Step 5: Poll until embedding_status=ready ──
    await pollEmbedding(upload.file_id);
    console.log(`[PASS] embedding complete for ${upload.file_id}`);

    // ── Step 6: List — file must appear ──
    const fileList = await client.rag.list({ limit: 50 });
    assert.ok(
      fileList.files.some((f) => f.file_id === upload.file_id),
      `uploaded file ${upload.file_id} not found in list`,
    );
    console.log(`[PASS] rag.list → total=${fileList.total}, uploaded file present`);

    // ── Step 7: Search ──
    const searchResp = await client.rag.search({
      query: "meshapi rag livetest node",
      top_k: 5,
      file_ids: [upload.file_id],
    });
    assert.ok(searchResp.results.length > 0, "search returned no results");
    console.log(
      `[PASS] rag.search → ${searchResp.results.length} results, top score=${searchResp.results[0].score.toFixed(4)}`,
    );
  });
});
