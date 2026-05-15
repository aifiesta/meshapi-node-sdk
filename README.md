# meshapi-node-sdk

Official TypeScript SDK for [Mesh API](https://meshapi.ai), an AI model gateway that gives you instant access to 321 LLMs through a single OpenAI-compatible API.

Code once with the chat completions signature you already know. Switch between OpenAI, Anthropic, Google, Meta, Mistral, DeepSeek, xAI, Alibaba and the rest by changing a model string. Streaming, tool calling, vision, embeddings, multi-model compare, batch jobs and prompt templates from a single client.

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

|                              |                                                                                                                                   |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **One Universal API**        | Code once. A single `chat.completions.create` call works across 321 base models.                                                  |
| **Streaming + tool calling** | SSE streaming via `AsyncIterable`, function calling with structured tool definitions, vision and audio content parts.             |
| **Reasoning models**         | First-class `responses` API with `reasoning.effort` and `max_output_tokens` for o-series and similar models.                      |
| **Embeddings**               | Drop-in OpenAI-compatible embeddings endpoint.                                                                                    |
| **Multi-model compare**      | Fire one prompt at N models in parallel and stream their replies side-by-side.                                                    |
| **Batches + Files**          | Async bulk inference jobs at discounted rates with file upload, download and lifecycle management.                                |
| **Prompt templates**         | Server-stored prompts with `{{variable}}` slots. Update prompts without redeploying.                                              |
| **Provider fallbacks**       | If a provider experiences downtime, the gateway falls back to another supported model so your inference stays up.                 |
| **Built-in rate limiting**   | Per-key RPM and RPD limits to prevent runaway costs. HTTP 429 with `retry_after` surfaced as `MeshAPIApiError.retryAfterSeconds`. |
| **Unified billing**          | One account balance covers every model. No juggling subscriptions.                                                                |
| **Structured errors**        | `MeshAPIApiError` with `errorCode`, `status`, `requestId`, `retryAfterSeconds`, and provider error details.                       |
| **TypeScript-native**        | Strict-mode types for every request and response, including streaming chunks and tool call deltas.                                |

## Configuration

```ts
const client = new MeshAPI({
  baseUrl: "https://api.meshapi.ai", // required
  token: "rsk_...", // required: data-plane key or Supabase JWT
  timeoutMs: 60_000, // default 60s
  signal: controller.signal, // optional global AbortSignal
  fetch: customFetch, // optional fetch override (mocks, polyfills)
});
```

Two auth realms. Use one client per realm.

## Authentication

All requests are authenticated using your Mesh API key (prefixed with `rsk_`).

```ts
const client = new MeshAPI({
  baseUrl: "https://api.yourdomain.com",
  token: "rsk_01JXXXXXXXXXXXXXXXXXXXXXXXXX",
});
```

### Configuration Options

```ts
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
console.log(`Tokens: ${reply.usage?.total_tokens}`);
```

### Streaming

```ts
const stream = client.chat.completions.create({
  model: "openai/gpt-4o-mini",
  messages: [{ role: "user", content: "Write a haiku about TypeScript." }],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta.content ?? "");
}
```

### Tool calling

```ts
const stream = client.chat.completions.create({
  model: "openai/gpt-4o",
  messages: [{ role: "user", content: "What's the weather in Paris?" }],
  tools: [
    {
      type: "function",
      function: {
        name: "get_weather",
        description: "Get current weather for a city",
        parameters: {
          type: "object",
          properties: { city: { type: "string" } },
          required: ["city"],
        },
      },
    },
  ],
  tool_choice: "auto",
  stream: true,
});

for await (const chunk of stream) {
  const delta = chunk.choices[0]?.delta;
  if (delta?.tool_calls) console.log("tool call:", delta.tool_calls);
  else if (delta?.content) process.stdout.write(delta.content);
}
```

### Cancelling a stream

```ts
const controller = new AbortController();
setTimeout(() => controller.abort(), 5_000);

const stream = client.chat.completions.create(
  { model: "openai/gpt-4o-mini", messages: [...], stream: true },
  { signal: controller.signal },
);

try {
  for await (const chunk of stream) {
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
```

Streaming works the same way as `chat.completions`.

## Embeddings

```ts
const result = await client.embeddings.create({
  model: "openai/text-embedding-3-small",
  input: ["hello world", "goodbye world"],
});

console.log(result.data[0].embedding.length);
```

## Compare (multi-model fanout)

```ts
const stream = client.compare.create({
  prompt: "Summarize this paragraph in one sentence: ...",
  models: [
    { model: "openai/gpt-4o-mini" },
    { model: "anthropic/claude-sonnet-4.5" },
    { model: "google/gemini-2.5-flash" },
  ],
  stream: true,
});

for await (const event of stream) {
  if (event.type === "delta") {
    console.log(`[${event.model}]`, event.delta);
  }
}
```

## Files and Batches

Upload a JSONL of requests, kick off a batch, poll until done. Batch jobs run at discounted pricing.

```ts
const file = await client.files.upload({
  purpose: "batch",
  requests: [
    {
      custom_id: "req-1",
      body: {
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "Hello" }],
      },
    },
  ],
});

const batch = await client.batches.create({
  input_file_id: file.id,
  endpoint: "/v1/chat/completions",
  completion_window: "24h",
});
```

// Create a template (works with data-plane key OR control-plane JWT)
const client = new MeshAPI({
  baseUrl: "https://api.yourdomain.com",
  token: "rsk_...",
});

const template = await client.templates.create({
  name: "support-agent",
  system:
    "You are a helpful customer support agent for {{company}}. Be concise and friendly.",
  model: "openai/gpt-4o-mini",
  variables: ["company"],
});

// Poll later
const status = await client.batches.get(batch.id);
if (status.status === "completed" && status.output_file_id) {
  const output = await client.files.downloadContent(status.output_file_id);
  // output is a Uint8Array of JSONL
}
```

### 4. Responses API (Reasoning Models)

```ts
const response = await client.responses.create({
  model: "openai/o4-mini",
  input: "Explain the halting problem in two sentences.",
  reasoning: { effort: "medium" },
  max_output_tokens: 512,
});

console.log(response.output);
```

Streaming works the same way via `client.responses.create({ ...stream: true })`.

### 5. Embeddings

```ts
const result = await client.embeddings.create({
  model: "openai/text-embedding-3-small",
  input: ["hello world", "goodbye world"],
});

console.log(result.data[0].embedding.length);
```

### 6. Compare (Multi-model Fanout)

Fire one prompt at several models and stream their replies in parallel.

```ts
const stream = client.compare.create({
  models: [
    "openai/gpt-4o-mini",
    "anthropic/claude-sonnet-4.5",
    "google/gemini-2.5-flash",
  ],
  messages: [
    { role: "user", content: "Summarize this paragraph in one sentence: ..." },
  ],
  stream: true,
});

for await (const event of stream) {
  if (event.event === "delta") {
    console.log(event.data);
  }
}
```

Use non-streaming compare with an optional judge-model comparison via `comparison_model`.

### 7. Files and Batches

Upload a list of requests, kick off a batch, poll until done. Batch jobs run at discounted pricing.

```ts
// 1. Upload the batch input
const file = await client.files.upload({
  purpose: "batch",
  requests: [
    {
      custom_id: "req-1",
      body: {
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "Say hi." }],
      },
    },
    {
      custom_id: "req-2",
      body: {
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "Say bye." }],
      },
    },
  ],
});

// 2. Create the batch
const batch = await client.batches.create({
  input_file_id: file.id,
  endpoint: "/v1/chat/completions",
  completion_window: "24h",
});

// 3. Poll later
const status = await client.batches.get(batch.id);
if (status.status === "completed" && status.output_file_id) {
  // Returns raw JSONL content as Uint8Array
  const outputBytes = await client.files.content(status.output_file_id);
}
```

### 8. Listing Models

```ts
const all = await client.models.list();
const free = await client.models.free();
const paid = await client.models.paid();

for (const m of paid.slice(0, 5)) {
  console.log(
    `${m.id}: prompt $${m.pricing.prompt_usd_per_1k}/1k, ` +
      `completion $${m.pricing.completion_usd_per_1k}/1k`,
  );
}
```

Free models (`is_free: true`) cost $0 for both prompt and completion, useful for testing and light tasks. Paid models charge per token against your account balance.

## Prompt templates

Server-stored prompts with `{{variable}}` interpolation. Reference them by name from `chat.completions` to skip re-sending system prompts every request.

```ts
// Create a template (control-plane JWT)
const ctrl = new MeshAPI({
  baseUrl: "https://api.meshapi.ai",
  token: supabaseSession.access_token,
});

await ctrl.templates.create({
  name: "support-agent",
  system: "You are a support agent for {{company}}. Be concise and friendly.",
  model: "openai/gpt-4o-mini",
  variables: ["company"],
});

// Use it (data-plane rsk_ key)
const reply = await client.chat.completions.create({
  messages: [{ role: "user", content: "How do I reset my password?" }],
  template: "support-agent",
  variables: { company: "Acme Corp" },
});

// CRUD
const list = await ctrl.templates.list();
const t = await ctrl.templates.get("uuid");
await ctrl.templates.update("uuid", { model: "openai/gpt-4o" });
await ctrl.templates.delete("uuid");
```

## Error handling

```ts
import { MeshAPI, MeshAPIApiError } from "meshapi-node-sdk";

try {
  await client.chat.completions.create({ ... });
} catch (err) {
  if (err instanceof MeshAPIApiError) {
    console.error(`[${err.status}] ${err.errorCode}: ${err.message}`);
    console.error("Request ID:", err.requestId);

    switch (err.errorCode) {
      case "rate_limit_exceeded": console.log(`Retry after ${err.retryAfterSeconds}s`); break;
      case "spend_limit_exceeded": console.log("Account balance exhausted. Top up to continue."); break;
      case "unauthorized": console.log("Invalid API key."); break;
      case "model_not_found": console.log("Model not supported."); break;
      case "upstream_error": console.log("Provider error:", err.providerError); break;
      case "validation_error": console.log("Invalid request:", err.details); break;
    }
  } else {
    throw err; // network, AbortError, etc.
  }
}
```

| Code                                                    | HTTP | Meaning                                      |
| ------------------------------------------------------- | ---- | -------------------------------------------- |
| `unauthorized`                                          | 401  | Invalid or missing key                       |
| `forbidden`                                             | 403  | Key suspended                                |
| `not_found` / `model_not_found`                         | 404  | Resource or model not found                  |
| `spend_limit_exceeded`                                  | 402  | Account balance at zero. Top up to continue. |
| `validation_error` / `unprocessable_entity`             | 422  | Bad request body                             |
| `rate_limit_exceeded`                                   | 429  | RPM or RPD limit hit                         |
| `upstream_error` / `gateway_timeout` / `internal_error` | 500  | Upstream or server error                     |
| `parse_error`                                           | n/a  | SDK could not parse response body            |

Mid-stream errors (sent as SSE frames before `[DONE]`) throw inside the `for await` loop with the same `MeshAPIApiError` type.

## TypeScript

Full `.d.ts` declarations ship with the package. Common types:

```ts
import type {
  MeshAPIConfig,
  ChatCompletionParams,
  ChatCompletionResponse,
  ChatCompletionChunk,
  ChatMessage,
  Tool,
  ToolCall,
  ResponsesParams,
  ResponsesResponse,
  EmbeddingsParams,
  EmbeddingsResponse,
  CompareParams,
  CompareStreamEvent,
  BatchObject,
  FileObject,
  ModelInfo,
  ModelPricing,
  TemplateSummary,
  CreateTemplateParams,
} from "meshapi-node-sdk";
```

## About Mesh API

[Mesh API](https://meshapi.ai) is an AI model gateway that gives you instant access to a massive variety of LLMs through a single, unified API. Enjoy the developer experience you already know, upgraded with universal model access.

|                            |                                                                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **One Universal API**      | A single `ChatCompletion` request works across 321 base models.                                                      |
| **Unified Billing**        | Deposit funds into one account and consume any model. No juggling provider subscriptions.                            |
| **Free Tier**              | Free models (`is_free: true`) cost $0 for both prompt and completion. Test and ship light workloads without funding. |
| **Provider Fallbacks**     | If a model or provider goes down, the gateway routes to another supported model so your inference stays up.          |
| **Built-in Rate Limiting** | Robust per-key limits prevent runaway costs.                                                                         |
| **Prompt Templates**       | Manage, version and share prompts via a secure templating system.                                                    |

Documentation lives at [developers.meshapi.ai](https://developers.meshapi.ai).

Built by the founders of [TagMango](https://tagmango.com) (YC W20) and [AI Fiesta](https://aifiesta.ai) (1M+ users).

## Related

- [`meshapi-code`](https://github.com/aifiesta/meshapi-code): terminal chat REPL with tool calling

## License

[MIT](LICENSE)
