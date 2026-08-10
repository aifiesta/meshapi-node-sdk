# meshapi-node-sdk

Official TypeScript SDK for [Mesh API](https://meshapi.ai), an AI model gateway that gives you instant access to 900+ LLMs through a single OpenAI-compatible API.

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

Node 18+. No required runtime dependencies — native `fetch`, `AsyncIterable` streaming, full strict-mode types. Realtime on Node 18–21 needs the optional `ws` peer (Node 22+ and browsers use the built-in `WebSocket`).

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
| **One Universal API** | Code once. A single `chat.completions.create` call works across every model in the catalogue. |
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
  maxRetries: 3,                     // default 3; 429/502/503/504 only
});
```

### Request IDs

Every response carries an `x-request-id` header. The SDK surfaces it on the
value each call returns, so a response can always be traced back to the call
that made it — including with many requests in flight.

**Non-streaming** — the id is on the returned object as `_requestId`:

```ts
const completion = await client.chat.completions.create({
  model: "openai/gpt-4o-mini",
  messages: [{ role: "user", content: "Hello!" }],
});

logger.info({ requestId: completion._requestId }, "completion done");
```

It is **non-enumerable**, so it never shows up in `JSON.stringify`,
`Object.keys` or object spread — code that serialises or deep-compares
responses is unaffected. It is `undefined` if the response carried no header,
and is not attached to array bodies (such as `models.list()`), which have
nowhere to put it.

**Streaming** — the id is on the returned stream as `requestId`, a promise that
resolves as soon as response headers arrive, before the first chunk:

```ts
const stream = client.chat.completions.create({ model, messages, stream: true });

logger.info({ requestId: await stream.requestId }, "stream started");

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta.content ?? "");
}
```

Because it lives on the stream object rather than on a shared callback, it stays
correct with any number of concurrent streams:

```ts
await Promise.all(
  [a, b, c].map(async (messages) => {
    const stream = client.chat.completions.create({ model, messages, stream: true });
    try {
      for await (const chunk of stream) { /* ... */ }
    } catch (err) {
      // Still available after a mid-stream failure or an abort.
      logger.error({ requestId: await stream.requestId }, "stream failed");
    }
  }),
);
```

Available on every streaming surface: `chat.completions.create({ stream: true })`,
`responses.create({ stream: true })`, `images.stream()` and
`compare.create({ stream: true })`. Reading it starts the request if iteration
has not already begun; the stream then reuses that same request. It resolves to
`undefined` — never rejects — if the response carried no header or the request
failed outright, since the failure itself surfaces through iteration.

**On errors** — `MeshAPIApiError.requestId` carries the same id, for both
streaming and non-streaming failures:

```ts
try {
  await client.chat.completions.create({ model, messages });
} catch (err) {
  if (err instanceof MeshAPIApiError) {
    console.error(err.status, err.errorCode, err.requestId);
  }
}
```

#### Abandoning a stream

If you read `requestId` and then decide **not** to consume the stream, call
`cancel()` — reading the property issues the request, and an unread response
body keeps the connection open with the provider still generating into it:

```ts
const stream = client.chat.completions.create({ model, messages, stream: true });

const requestId = await stream.requestId;
if (!shouldProceed(requestId)) {
  await stream.cancel();
  return;
}

for await (const chunk of stream) { ... }
```

`cancel()` is idempotent and never throws. Where the runtime supports explicit
resource management it is also wired to `Symbol.asyncDispose`, so
`await using stream = ...` cleans up for you.

You do **not** need it on the normal paths — running a loop to completion,
`break`ing out of one, or a mid-stream failure all release the connection
themselves.

#### Logging every request

There is no built-in response hook. For request-level logging, metrics or
tracing across all calls, wrap `fetch` — it sees every request the client makes
and composes with anything else you already use:

```ts
const client = new MeshAPI({
  baseUrl: "https://api.meshapi.ai",
  token: process.env.MESHAPI_API_KEY!,
  fetch: async (input, init) => {
    const startedAt = Date.now();
    const response = await fetch(input, init);
    logger.info(
      {
        requestId: response.headers.get("x-request-id"),
        status: response.status,
        durationMs: Date.now() - startedAt,
      },
      "meshapi request",
    );
    return response;
  },
});
```

> **Removed in 2.0.0.** The `onResponse` config hook existed only to expose this
> request id on successful responses. Now that the id is on the returned value
> — where it can actually be correlated to a specific call — the hook was
> redundant, and it could never answer "which of these concurrent requests was
> that?". Replace it with `_requestId` / `stream.requestId`, or with the `fetch`
> wrapper above if you were using it for general logging. Note that a custom
> `fetch` sees the raw URL, including the signed-upload query string used by
> `rag.uploadFile()` — strip it before logging if that matters to you.

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

## Structured outputs

`chat.completions.parse()` constrains the model to a JSON schema and returns a
parsed, typed result. Pass a [Standard Schema](https://standardschema.dev)
validator (Zod v4, Valibot, ArkType) for runtime validation + typing, or a
raw JSON schema object.

```ts
import { z } from "zod"; // optional peer dependency — only needed for this path

const Country = z.object({
  country: z.string(),
  capital: z.string(),
  populationMillions: z.number(),
});

const country = await client.chat.completions.parse(
  {
    model: "openai/gpt-4o-mini",
    messages: [{ role: "user", content: "Give me structured facts about France." }],
  },
  Country,
);
console.log(country.capital, country.populationMillions); // typed + validated
```

No validator? Pass a raw JSON schema and type the result yourself:

```ts
interface Country { country: string; capital: string }

const country = await client.chat.completions.parse<Country>(
  { model: "openai/gpt-4o-mini", messages: [{ role: "user", content: "…" }] },
  { name: "country", schema: { type: "object", properties: {
    country: { type: "string" }, capital: { type: "string" } },
    required: ["country", "capital"], additionalProperties: false } },
);
```

> The SDK has no required runtime dependencies. JSON-schema derivation is loaded
> on demand per vendor: a Zod schema dynamic-imports `zod` (v4, optional peer);
> a Valibot schema dynamic-imports `@valibot/to-json-schema` (optional peer —
> install it alongside valibot); other Standard Schema validators are supported
> if they expose a `toJsonSchema()` method (e.g. ArkType). No converter
> available? Pass a raw JSON schema `{ name, schema }` — that path needs
> nothing.

### Auto-retry (opt-in)

Set `maxRetries` to feed a failed response back to the model with the validation
error appended. Each retry is a billed call; the default is `0`. An empty
response (a refusal or a tool call instead of text) is terminal and never
retried — a correction prompt can't fix it.

```ts
await client.chat.completions.parse(params, Country, { maxRetries: 3 });
```

### When the model doesn't support structured output

If parsing fails after any retries, `parse()` throws `StructuredOutputError` (a
`MeshAPIApiError` subclass; the underlying error is on `.cause`). When the model
returns plain text instead of JSON — usually because it doesn't support
`response_format` — the message points you at the model's support:

```ts
import { StructuredOutputError } from "meshapi-node-sdk";

try {
  await client.chat.completions.parse(params, Country);
} catch (err) {
  if (err instanceof StructuredOutputError) console.error(err.message);
  // "… the model returned text that is not valid JSON … Check the model's
  //  support on the Models page (https://app.meshapi.ai/…/models) …"
}
```

Check a model's `supports_structured_output` flag via `GET /v1/models`, or on the
Models page in your dashboard. `parse()` is non-streaming.

## Responses API (reasoning models)

```ts
const reply = await client.responses.create({
  model: "openai/o4-mini",
  input: "Explain the halting problem in two sentences.",
  reasoning: { effort: "medium" },
  max_output_tokens: 512,
});

// The Responses API returns `output`, not `choices` — the text lives on the
// message item's content parts.
const text = reply.output
  ?.filter((item) => item.type === "message")
  .flatMap((item) => item.content ?? [])
  .map((part) => part.text ?? "")
  .join("");
console.log(text);

// Streaming yields `response.*` lifecycle events; text arrives on
// `response.output_text.delta`.
for await (const event of client.responses.create({
  model: "openai/o4-mini",
  input: "Explain the halting problem in two sentences.",
  stream: true,
})) {
  if (event.type === "response.output_text.delta") {
    process.stdout.write(String(event.delta ?? ""));
  }
}

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

// Speech-to-text — the audio bytes are the first argument, params the second.
const audioFile = readFileSync("audio.wav");
const result = await client.audio.transcribe(
  audioFile,
  // `language_code` is optional and its accepted values are model-specific —
  // sarvam/saaras:v3 expects locales such as "en-IN", not bare "en".
  { model: "sarvam/saaras:v3", language_code: "en-IN" },
  { filename: "audio.wav" }, // optional; defaults to "audio.mp3"
);
console.log(result.text);

// Fetch a previously submitted transcription by id
const existing = await client.audio.getTranscription("transcription-id");

// Translate audio to English (via /v1/audio/transcriptions/translate)
const translated = await client.audio.translate(
  audioFile,
  { model: "sarvam/saaras:v3" },
  { filename: "audio.wav" },
);
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
// Frames have no `event`/`data` wrapper — narrow on the fields present.
for await (const event of client.compare.create({
  models: ["openai/gpt-4o-mini", "anthropic/claude-sonnet-4.5"],
  messages: [{ role: "user", content: "Summarise in one sentence: ..." }],
  stream: true,
})) {
  if ("model" in event) {
    // One participating model finished; `delta` holds its full answer.
    console.log(`${event.model} (${event.latency_ms}ms): ${event.delta}`);
  } else if ("results" in event) {
    console.log(`all ${event.results.length} results in`);
  } else if ("total_latency_ms" in event) {
    console.log(`done in ${event.total_latency_ms}ms`);
  } else if ("delta" in event) {
    // Token delta from the comparison model's own summary.
    process.stdout.write(event.delta);
  }
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

// Read the output — results arrive inline on the batch object once complete.
if (status.status === "completed") {
  for (const r of status.results ?? []) {
    console.log(r.custom_id, JSON.stringify(r.response?.body ?? r));
  }
}

// List past batches (paginated via `after` + `limit`)
const batches = await client.batches.list({ limit: 20 });

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

// 3. Wait for the upload to finish, then trigger embedding.
//    embed() rejects a file that is still uploading — and reports that inside
//    `results[]` rather than throwing, so it is easy to miss.
while ((await client.rag.get(upload.file_id)).upload_status !== "ready") {
  await new Promise(r => setTimeout(r, 1_000));
}
const embedded = await client.rag.embed({ file_ids: [upload.file_id] });
for (const r of embedded.results) {
  if (r.embedding_status === "error") throw new Error(r.error ?? "embedding failed");
}

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
const template = await client.templates.get("uuid");
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

## Retry and backoff

Retries on 429/502/503/504 with exponential backoff (default 3 retries, 500 ms base, 30 s max). **Streams do not retry.**

## TypeScript types

```ts
import type {
  MeshAPIConfig, SSEStream, WithRequestId,
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

[Mesh API](https://meshapi.ai) is an AI model gateway that gives you instant access to 900+ LLMs through a single, unified API.

Documentation: [developers.meshapi.ai](https://developers.meshapi.ai)

Built by the founders of [TagMango](https://tagmango.com) (YC W20) and [AI Fiesta](https://aifiesta.ai) (1M+ users).

## License

[MIT](LICENSE)
