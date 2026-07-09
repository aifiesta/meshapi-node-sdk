# meshapi-node-sdk

Official TypeScript SDK for [Mesh API](https://meshapi.ai), an AI model gateway that gives you instant access to 300+ LLMs through a single OpenAI-compatible API.

Code once with the chat completions signature you already know. Switch between OpenAI, Anthropic, Google, Meta, Mistral, DeepSeek, xAI, Alibaba and the rest by changing a model string. Streaming, tool calling, vision, embeddings, multi-model compare, batch jobs, RAG and prompt templates from a single client.

```ts
import { MeshAPI } from "meshapi-node-sdk";

const client = new MeshAPI({
  baseUrl: "https://api.meshapi.ai",
  token: process.env.MESHAPI_API_KEY!,
});

const reply = await client.chat.completions.create({
  model: "anthropic/claude-sonnet-4.5",
  messages: [{ role: "user", content: "Write a haiku about TypeScript." }],
});

console.log(reply.choices[0]?.message.content);
```

Node 18+. Zero runtime dependencies. Native `fetch`, `AsyncIterable` streaming, full strict-mode types.

## Install

```bash
npm install meshapi-node-sdk
pnpm add meshapi-node-sdk
yarn add meshapi-node-sdk
```

Get a key at [meshapi.ai](https://meshapi.ai). Data-plane keys are prefixed `rsk_`.

## What you get

| | |
| --- | --- |
| **One Universal API** | Code once. A single `chat.completions.create` call works across 300+ base models. |
| **Streaming + tool calling** | SSE streaming via `AsyncIterable`, function calling, vision and audio content parts. |
| **Reasoning models** | First-class `responses` API with `reasoning.effort` and `max_output_tokens`. |
| **Embeddings** | Drop-in OpenAI-compatible embeddings endpoint. |
| **Multi-model compare** | Fire one prompt at N models in parallel and stream their replies side-by-side. |
| **Audio** | Text-to-speech, speech-to-text, transcription translation, and voice listing. |
| **Video** | Submit and poll async video generation tasks. |
| **RAG** | Upload files, embed them, and run vector search — all through the same client. |
| **Batches** | Async bulk inference jobs at discounted rates with inline request submission. |
| **Prompt templates** | Server-stored prompts with `{{variable}}` slots. Update prompts without redeploying. |
| **Provider fallbacks** | If a provider experiences downtime, the gateway routes to another supported model. |
| **Structured errors** | `MeshAPIApiError` with `errorCode`, `status`, `requestId`, `retryAfterSeconds`. |
| **TypeScript-native** | Strict-mode types for every request and response, including streaming chunks. |

## Configuration

```ts
const client = new MeshAPI({
  baseUrl: "https://api.meshapi.ai", // required
  token: "rsk_...",                  // required
  timeoutMs: 60_000,                 // default 60 s
  signal: controller.signal,         // optional global AbortSignal
  fetch: customFetch,                // optional fetch override
  retry: { maxRetries: 3 },          // transport retry policy (see Resilience)
  fallback: { models: [...] },       // client-side model-fallback chain
  debug: true,                       // readable retry/fallback lines on stderr
  logger: (event) => {},             // structured resilience events
});
```

## Chat completions

```ts
// Non-streaming
const reply = await client.chat.completions.create({
  model: "openai/gpt-4o-mini",
  messages: [
    { role: "system", content: "You are a concise assistant." },
    { role: "user", content: "What is the capital of France?" },
  ],
  temperature: 0.7,
  max_tokens: 256,
});
console.log(reply.choices[0]?.message.content);

// Streaming
const stream = client.chat.completions.create({
  model: "openai/gpt-4o-mini",
  messages: [{ role: "user", content: "Write a haiku about TypeScript." }],
  stream: true,
});
for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta.content ?? "");
}

// Tool calling
const toolStream = client.chat.completions.create({
  model: "openai/gpt-4o",
  messages: [{ role: "user", content: "What's the weather in Paris?" }],
  tools: [{ type: "function", function: { name: "get_weather", ... } }],
  tool_choice: "auto",
  stream: true,
});
for await (const chunk of toolStream) {
  const delta = chunk.choices[0]?.delta;
  if (delta?.tool_calls) console.log("tool call:", delta.tool_calls);
  else if (delta?.content) process.stdout.write(delta.content);
}
```

### Cancelling a stream

```ts
const controller = new AbortController();
setTimeout(() => controller.abort(), 5_000);

try {
  for await (const chunk of client.chat.completions.create(
    { model: "openai/gpt-4o-mini", messages: [...], stream: true },
    { signal: controller.signal },
  )) {
    process.stdout.write(chunk.choices[0]?.delta.content ?? "");
  }
} catch (err) {
  if ((err as Error).name === "AbortError") console.log("\nCancelled.");
}
```

## Responses API (reasoning models)

```ts
const reply = await client.responses.create({
  model: "openai/o4-mini",
  input: "Explain the halting problem in two sentences.",
  reasoning: { effort: "medium" },
  max_output_tokens: 512,
});
console.log(reply.choices[0]?.message.content);

// List background response jobs, or fetch one by id
const jobs = await client.responses.list({ limit: 20 });
const job = await client.responses.get("resp_abc123");
```

## Embeddings

```ts
const result = await client.embeddings.create({
  model: "openai/text-embedding-3-small",
  input: ["hello world", "goodbye world"],
});
console.log(result.data[0].embedding.length);
```

## Audio (TTS, STT, voices)

```ts
import { readFileSync, writeFileSync } from "fs";

// Text-to-speech — returns Uint8Array of raw audio bytes
const audio = await client.audio.synthesize({
  input: "Hello from MeshAPI.",
  model: "sarvam/bulbul:v2",
  voice: "meera",
});
writeFileSync("output.wav", Buffer.from(audio));

// Speech-to-text — submit a transcription job
const audioFile = readFileSync("audio.wav");
const result = await client.audio.transcribe({
  model: "sarvam/saaras:v3",
  file: audioFile,
  file_name: "audio.wav",
  language: "en",
});
console.log(result.text);

// Translate audio to English (via /v1/audio/transcriptions/translate)
const translated = await client.audio.translate({
  model: "sarvam/saaras:v3",
  file: audioFile,
  file_name: "audio.wav",
});
console.log(translated.text);

// Standalone OpenAI-compatible translate (POST /v1/audio/translations)
// Distinct from translate() above — use this for OpenAI-style compatibility.
const translation = await client.audio.translations(audioFile, {
  model: "openai/whisper-1",
  prompt: "Optional context hint",
});
console.log(translation.text);

// List available voices
const voices = await client.audio.listVoices({ page_size: 10 });

// Get a specific voice
const voice = await client.audio.getVoice("voice-id");
```

## Video generation

```ts
// Submit a video generation task
const task = await client.videos.generate({
  model: "byteplus/dreamina-seedance-2-0",
  content: [{ type: "text", text: "A serene mountain lake at sunrise" }],
});
console.log(`Task ID: ${task.id}`);

// Poll until complete
while (true) {
  const status = await client.videos.retrieve(task.id);
  if (status.status === "succeeded" || status.status === "failed") break;
  await new Promise(r => setTimeout(r, 5_000));
}

// List past generation tasks
const listing = await client.videos.list({ limit: 20 });
console.log(`${listing.total} total tasks`);
```

## Image generation

```ts
const result = await client.images.generate({
  model: "openai/gpt-image-1",
  prompt: "A watercolor of a fox in a snowy forest",
  n: 1, size: "1024x1024", quality: "high", output_format: "webp",
});
console.log(result.data[0].url);

// Streaming
for await (const chunk of client.images.stream({ model: "openai/gpt-image-1", prompt: "...", n: 1 })) {
  if (chunk.status === "processing") console.log("Generating...");
  else if (chunk.data?.length) console.log("Done:", chunk.data[0].url);
}

// Editing — `image` is a base64 / data: URL (remote http(s) URLs are rejected).
const edited = await client.images.edit({
  model: "openai/gpt-image-1",
  image: "data:image/png;base64,<...>",
  prompt: "Replace the background with a beach at sunset",
  operation: "edit", // or inpaint / outpaint / mix / reframe / upscale / remove_background
});
```

## Compare (multi-model fanout)

```ts
for await (const event of client.compare.create({
  models: ["openai/gpt-4o-mini", "anthropic/claude-sonnet-4.5"],
  messages: [{ role: "user", content: "Summarise in one sentence: ..." }],
  stream: true,
})) {
  if (event.event === "delta") console.log(event.data);
}
```

## Batches

Batch jobs accept inline requests — no separate file upload step required.

```ts
const batch = await client.batches.create({
  requests: [
    { custom_id: "req-1", body: { model: "openai/gpt-5-nano", messages: [{ role: "user", content: "Say hi." }] } },
    { custom_id: "req-2", body: { model: "openai/gpt-5-nano", messages: [{ role: "user", content: "Say bye." }] } },
  ],
  metadata: { job: "my-batch" },
});

// Poll
const status = await client.batches.get(batch.id);
console.log(status.status);

// Cancel
await client.batches.cancel(batch.id);
```

## RAG (Retrieval-Augmented Generation)

Upload files, embed them, and run vector search.

```ts
// 1. Initialise upload — get a signed URL
const upload = await client.rag.initUpload({
  file_name: "handbook.pdf",
  mime_type: "application/pdf",
});

// 2a. PUT file bytes to the signed URL yourself…
await fetch(upload.signed_url, {
  method: "PUT",
  body: pdfBytes,
  headers: { "Content-Type": "application/pdf" },
});

// 2b. …or use the convenience wrapper that does both steps:
const upload2 = await client.rag.uploadFile({
  file_name: "handbook.pdf",
  mime_type: "application/pdf",
  content: pdfBytes, // Uint8Array or string
});

// 3. Trigger embedding
await client.rag.embed({ file_ids: [upload.file_id] });

// 4. Poll until ready
while (true) {
  const s = await client.rag.get(upload.file_id);
  if (s.embedding_status === "ready") break;
  await new Promise(r => setTimeout(r, 3_000));
}

// 5. Search
const results = await client.rag.search({
  query: "onboarding process",
  top_k: 5,
});
for (const r of results.results) {
  console.log(`${r.score.toFixed(4)}  ${r.text}`);
}

// List files (paginated)
const list = await client.rag.list({ limit: 50 });
console.log(`${list.total} total files`);
```

## Realtime (Speech-to-Speech WebSocket)

```ts
import { MeshAPI, RealtimeError } from "meshapi-node-sdk";

const client = new MeshAPI({ baseUrl: "...", token: "rsk_..." });

const session = await client.realtime.connect({
  model: "openai/gpt-4o-realtime-preview",
});

// Callback style
session.on("message", (msg) => {
  console.log(msg.event?.type);     // "session.created", "response.done", …
  if (msg.audio) processAudio(msg.audio);  // binary audio frame
});
session.on("error", (err) => {
  if (err instanceof RealtimeError) {
    console.error(err.code);        // "insufficient_quota", "idle_timeout", …
  }
});
session.on("close", () => console.log("done"));

// Async iterator style
for await (const msg of session) {
  console.log(msg.event?.type);
  if (msg.audio) processAudio(msg.audio);
}

// Send events and audio
await session.send({ type: "session.update", session: { instructions: "..." } });
await session.sendAudio(pcmBytes);

await session.close();
```

Works in Node 22+ and browsers with the native `WebSocket` global. On Node 18–21, install the optional `ws` package (`npm install ws`).

## Models

```ts
const all  = await client.models.list();
const free = await client.models.free();
const paid = await client.models.paid();

// Paginated catalog search (DB-only, no model cost)
const page = await client.models.search({ q: "gpt", limit: 10 });
console.log(page.total, page.brands);

// Fetch one model's detail
const gpt4o = await client.models.get("openai/gpt-4o");
```

## Moderations

```ts
const res = await client.moderations.create({ input: "text to classify" });
if (res.results[0]?.flagged) console.log(res.results[0].categories);
```

## Web search

Gated server-side by `WEB_SEARCH_ENABLED`. Native-first with Tavily fallback —
inspect `res.provider` to see which engine served the request.

```ts
const res = await client.web.search({ query: "latest Mars rover news", max_results: 5, include_answer: true });
console.log(res.provider, res.answer);
for (const hit of res.results) console.log(hit.title, hit.url);
```

## Router select

Gated server-side by `AUTO_ROUTER_ENABLED`. Returns the model the Auto Router
*would* pick — without running inference.

```ts
const sel = await client.router.select({ messages: [{ role: "user", content: "Prove that 2+2=4." }] });
console.log(sel.model, sel.auto_router.fallback_used);
```

## Prompt templates

```ts
// Create (works with data-plane key or control-plane JWT)
await client.templates.create({
  name: "support-agent",
  system: "You are a support agent for {{company}}. Be concise and friendly.",
  model: "openai/gpt-4o-mini",
  variables: ["company"],
});

// Use via chat
const reply = await client.chat.completions.create({
  messages: [{ role: "user", content: "How do I reset my password?" }],
  template: "support-agent",
  variables: { company: "Acme Corp" },
});

// CRUD
const list = await client.templates.list();
await client.templates.update("uuid", { model: "openai/gpt-4o" });
await client.templates.delete("uuid");
```

## Error handling

```ts
import { MeshAPIApiError } from "meshapi-node-sdk";

try {
  await client.chat.completions.create({ ... });
} catch (err) {
  if (err instanceof MeshAPIApiError) {
    console.error(`[${err.status}] ${err.errorCode}: ${err.message}`);
    console.error("Request ID:", err.requestId);
    if (err.errorCode === "rate_limit_exceeded")
      console.log(`Retry after ${err.retryAfterSeconds}s`);
  }
}
```

| Code | HTTP | Meaning |
| --- | --- | --- |
| `unauthorized` | 401 | Invalid or missing key |
| `forbidden` | 403 | Key suspended |
| `not_found` / `model_not_found` | 404 | Resource or model not found |
| `spend_limit_exceeded` | 402 | Account balance at zero |
| `validation_error` | 422 | Bad request body |
| `rate_limit_exceeded` | 429 | RPM or RPD limit hit |
| `upstream_error` | 500 | Upstream or server error |
| `stream_interrupted` | n/a | Mid-stream connection dropped |

## Resilience: retry, fallback, and observability

### Transport retry

Every non-streaming request retries on 429/502/503/504 with exponential
backoff + jitter, honouring `Retry-After` (default 3 retries, 500 ms base,
30 s max). **Streams never retry.** The policy is configurable:

```ts
const client = new MeshAPI({
  baseUrl,
  token,
  retry: {
    maxRetries: 5,            // default 3
    retryOnStatus: [429, 503], // default [429, 502, 503, 504]
    backoffBaseMs: 250,       // default 500
    backoffMaxMs: 10_000,     // default 30_000
    respectRetryAfter: true,  // default true
    retryOnNetworkError: true, // default false — POSTs are non-idempotent
  },
});
```

(The top-level `maxRetries` option still works and maps onto `retry.maxRetries`.)

### Model fallback chain

`chat.completions.create` (non-streaming) can fall back to other models when
the primary fails with a transient error (default 502/503/504, after transport
retries). Configure a chain client-wide or per call:

```ts
const client = new MeshAPI({
  baseUrl,
  token,
  fallback: { models: ["anthropic/claude-sonnet-5", "mistral/mistral-large"] },
});

// Per-call override (never sent to the server):
await client.chat.completions.create({
  model: "openai/gpt-4o",
  messages,
  fallbackModels: ["anthropic/claude-sonnet-5"],
});
```

Terminal errors (auth, validation, billing) never advance the chain. This is
distinct from the `models` request param, which is a server-side
provider-handled list.

### Seeing what happened: `debug` and `logger`

With `debug: true`, every retry and fallback prints a readable line to stderr:

```
[meshapi] retrying POST /v1/chat/completions (attempt 1/4 failed: 503, next in 512ms) [req_abc]
[meshapi] falling back openai/gpt-4o → anthropic/claude-sonnet-5 (1/2: 503 provider_not_available)
[meshapi] gateway served /v1/chat/completions via bedrock (2 attempts, provider fallback) [req_abc]
```

For structured logging, pass a `logger` — it receives every `retry`,
`fallback`, and `gateway-routing` event:

```ts
const client = new MeshAPI({
  baseUrl,
  token,
  logger: (event) => {
    if (event.type === "retry") myLog.warn("meshapi retry", event);
    if (event.type === "fallback") myLog.warn("meshapi fallback", event);
    if (event.type === "gateway-routing" && event.fallback) {
      myLog.info(`served by ${event.servedProvider} after ${event.attempts} attempts`);
    }
  },
});
```

`gateway-routing` events report the **server-side** resilience the gateway
itself performed (per-key `routing_policy`: same-target retries +
cross-provider fallback), parsed from the `X-Mesh-Routing-Attempts` /
`X-Mesh-Routing-Fallback` / `X-Mesh-Served-Provider` response headers. They
appear only when your API key has an active routing policy. Streaming
responses carry no routing headers — check your MeshAPI dashboard logs for
per-request routing detail instead.

## TypeScript types

```ts
import type {
  MeshAPIConfig,
  // chat
  ChatCompletionParams, ChatCompletionResponse, ChatCompletionChunk,
  ChatMessage, Tool, ToolCall,
  // responses
  ResponsesParams, ResponsesResponse,
  // embeddings
  EmbeddingsParams, EmbeddingsResponse,
  // compare
  CompareParams, CompareStreamEvent,
  // batches
  BatchRequestItem, CreateBatchParams, BatchObject,
  // RAG
  InitUploadRequest, InitUploadResponse, UploadFileParams,
  RagFileStatus, RagFileListResponse,
  BulkEmbedRequest, BulkEmbedResponse,
  SearchRequest, SearchResponse, SearchResult,
  // audio
  SpeechParams, TranscriptionParams, TranscriptionTranslateParams,
  TranscriptionResponse, ListVoicesParams,
  // video
  VideoGenerationParams, VideoContentItem,
  CreateVideoGenerationResponse, VideoTaskResponse, VideoTaskListResponse,
  ListVideoGenerationsParams,
  // models
  ModelInfo, ModelPricing,
  // templates
  TemplateSummary, CreateTemplateParams, UpdateTemplateParams,
} from "meshapi-node-sdk";
```

## About Mesh API

[Mesh API](https://meshapi.ai) is an AI model gateway that gives you instant access to 300+ LLMs through a single, unified API.

Documentation: [developers.meshapi.ai](https://developers.meshapi.ai)

Built by the founders of [TagMango](https://tagmango.com) (YC W20) and [AI Fiesta](https://aifiesta.ai) (1M+ users).

## License

[MIT](LICENSE)
