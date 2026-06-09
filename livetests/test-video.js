import { MeshAPI } from "meshapi-node-sdk";
import { config } from "./config.js";

const client = new MeshAPI(config);
const VIDEO_MODEL = process.env.MESHAPI_VIDEO_GEN_MODEL ?? "";

async function testVideoList() {
  const listing = await client.videos.list({ limit: 5 });
  console.assert(Array.isArray(listing.data), "Expected data array");
  console.log(`[PASS] videos.list -> total=${listing.total}, items=${listing.data.length}`);
}

async function testVideoGenerateAndRetrieve() {
  if (!VIDEO_MODEL) {
    console.log("[SKIP] videos.generate — MESHAPI_VIDEO_GEN_MODEL not set");
    return;
  }
  const resp = await client.videos.generate({
    model: VIDEO_MODEL,
    content: [{ type: "text", text: "A serene mountain lake at sunrise" }],
  });
  console.assert(resp.id, "Expected task id");
  console.log(`[PASS] videos.generate -> task_id=${resp.id}`);

  const task = await client.videos.retrieve(resp.id);
  console.assert(task.id === resp.id, "Task id mismatch");
  console.log(`[PASS] videos.retrieve -> status=${task.status}`);
}

async function main() {
  await testVideoList();
  await testVideoGenerateAndRetrieve();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
