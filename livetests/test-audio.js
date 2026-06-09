import { MeshAPI } from "meshapi-node-sdk";
import { config } from "./config.js";

const client = new MeshAPI(config);

async function testSpeechSynthesize() {
  const audio = await client.audio.synthesize({
    input: "Hello from MeshAPI audio test.",
  });
  console.assert(audio instanceof Uint8Array && audio.length > 0, "Expected non-empty audio bytes");
  console.log(`[PASS] audio.synthesize -> ${audio.length} bytes`);
}

async function testListVoices() {
  const voices = await client.audio.listVoices({ page_size: 5 });
  console.assert(voices != null, "Expected non-null voices response");
  console.log("[PASS] audio.listVoices ->", typeof voices);
}

async function main() {
  await testSpeechSynthesize();
  await testListVoices();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
