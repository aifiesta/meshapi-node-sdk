# meshapi-node-sdk

TypeScript SDK for the **MeshAPI** AI model gateway — an OpenAI-compatible API that proxies to OpenRouter with multi-tenant key management, rate limiting, and prompt templates.

Supports **Node.js 18+** with full TypeScript strict-mode types, native `fetch`, and streaming via `AsyncIterable`.

---

## Installation

```bash
npm install meshapi-node-sdk
```

Or with pnpm / yarn:

```bash
pnpm add meshapi-node-sdk
yarn add meshapi-node-sdk
```

---

## Quick Start

```ts
import { MeshAPI } from "meshapi-node-sdk";

const client = new MeshAPI({
  baseUrl: "https://api.yourdomain.com",
  token: "rsk_01JXXXXXXXXXXXXXXXXXXXXXXXXX", // data-plane API key
});
```

---

## Authentication

MeshAPI has distinct auth realms. Use **one client instance per realm**:

| Realm | Token | Endpoints |
|---|---|---|
| **Data-plane** | `rsk_<ULID>` | `chat.completions`, `models` |
| **Control-plane** | Supabase JWT | `templates`, `models` |

```ts
// Data-plane client — chat completions
const dataClient = new MeshAPI({
  baseUrl: "https://api.yourdomain.com",
  token: "rsk_01JXXXXXXXXXXXXXXXXXXXXXXXXX",
});

// Control-plane client — manage templates
const ctrlClient = new MeshAPI({
  baseUrl: "https://api.yourdomain.com",
  token: supabaseSession.access_token,
});
```

### Configuration Options

```ts
const client = new MeshAPI({
  baseUrl: "https://api.yourdomain.com",  // required
  token: "rsk_...",                        // required
  timeoutMs: 30_000,                       // default: 60_000 (60s)
  signal: myAbortController.signal,        // optional global AbortSignal
  fetch: customFetch,                      // optional fetch override (for mocking/polyfills)
});
```

---

## Usage Examples

### 1. Chat Completions (non-streaming)

```ts
import { MeshAPI } from "meshapi-node-sdk";

const client = new MeshAPI({
  baseUrl: "https://api.yourdomain.com",
  token: "rsk_01JXXXXXXXXXXXXXXXXXXXXXXXXX",
});

const response = await client.chat.completions.create({
  model: "openai/gpt-4o-mini",
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "What is the capital of France?" },
  ],
  temperature: 0.7,
  max_tokens: 256,
});

console.log(response.choices[0]?.message.content);
// → "The capital of France is Paris."

console.log(`Tokens used: ${response.usage?.total_tokens}`);
```

### 2. Chat Completions (streaming)

```ts
const stream = client.chat.completions.create({
  model: "openai/gpt-4o-mini",
  messages: [{ role: "user", content: "Write a haiku about TypeScript." }],
  stream: true,
});

let fullText = "";

for await (const chunk of stream) {
  const delta = chunk.choices[0]?.delta.content ?? "";
  process.stdout.write(delta);
  fullText += delta;
}

console.log("\n--- Full response:", fullText);
```

#### Streaming with tool calls

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
          properties: {
            city: { type: "string" },
          },
          required: ["city"],
        },
      },
    },
  ],
  tool_choice: "auto",
  stream: true,
});

for await (const chunk of stream) {
  // handle delta content or tool_calls
  console.log(JSON.stringify(chunk.choices[0]?.delta));
}
```

#### Cancelling a stream

```ts
const controller = new AbortController();

// Cancel after 5 seconds
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
  if ((err as Error).name === "AbortError") {
    console.log("Stream cancelled.");
  }
}
```

### 3. Using Prompt Templates

Templates let you define reusable prompts with `{{variable}}` slots.

```ts
// Create a template (control-plane JWT required)
const ctrlClient = new MeshAPI({
  baseUrl: "https://api.yourdomain.com",
  token: supabaseSession.access_token,
});

const template = await ctrlClient.templates.create({
  name: "support-agent",
  system: "You are a helpful customer support agent for {{company}}. Be concise and friendly.",
  model: "openai/gpt-4o-mini",
  variables: ["company"],
});

console.log("Created template:", template.id);

// Use the template in a chat completion (data-plane key)
const response = await client.chat.completions.create({
  messages: [{ role: "user", content: "How do I reset my password?" }],
  template: "support-agent",         // template name or UUID
  variables: { company: "Acme Corp" },
});

console.log(response.choices[0]?.message.content);
```

### 4. Listing Models

```ts
// All models
const all = await client.models.list();

// Free models only
const free = await client.models.free();

// Paid models only
const paid = await client.models.paid();

// List with filter param
const freeViaParam = await client.models.list({ free: true });

// Print model pricing
for (const model of paid.slice(0, 5)) {
  console.log(
    `${model.id} — prompt: $${model.pricing.prompt_usd_per_1k}/1k, ` +
    `completion: $${model.pricing.completion_usd_per_1k}/1k`
  );
}
```

### 5. Template CRUD

```ts
// List all templates
const templates = await ctrlClient.templates.list();

// Get a specific template
const t = await ctrlClient.templates.get("uuid-here");

// Update a template
const updated = await ctrlClient.templates.update("uuid-here", {
  system: "You are a concise assistant for {{company}}.",
  model: "openai/gpt-4o",
});

// Delete a template
await ctrlClient.templates.delete("uuid-here");
```

---

## Error Handling

All API errors throw `MeshAPIApiError`, a subclass of `Error` with structured fields:

```ts
import { MeshAPI, MeshAPIApiError } from "meshapi-node-sdk";

try {
  const response = await client.chat.completions.create({
    model: "openai/gpt-4o-mini",
    messages: [{ role: "user", content: "Hello" }],
  });
  console.log(response.choices[0]?.message.content);

} catch (err) {
  if (err instanceof MeshAPIApiError) {
    console.error(`[${err.status}] ${err.errorCode}: ${err.message}`);
    console.error("Request ID:", err.requestId);

    switch (err.errorCode) {
      case "rate_limit_exceeded":
        console.log(`Retry after ${err.retryAfterSeconds}s`);
        break;

      case "spend_limit_exceeded":
        console.log("Spend cap reached — add credits.");
        break;

      case "unauthorized":
        console.log("Invalid or missing API key.");
        break;

      case "model_not_found":
        console.log("Model not supported by the gateway.");
        break;

      case "upstream_error":
        console.log("Upstream provider error:", err.providerError);
        break;

      case "validation_error":
        console.log("Validation details:", err.details);
        break;
    }
  } else {
    // Network error, AbortError, etc.
    throw err;
  }
}
```

### Error codes reference

| Code | HTTP | Description |
|---|---|---|
| `unauthorized` | 401 | Invalid or missing API key |
| `forbidden` | 403 | Key suspended or access denied |
| `not_found` | 404 | Resource not found |
| `model_not_found` | 404 | Model not supported |
| `validation_error` | 422 | Request body failed validation |
| `unprocessable_entity` | 422 | Request cannot be processed |
| `rate_limit_exceeded` | 429 | RPM or RPD limit hit |
| `spend_limit_exceeded` | 402 | Per-key spend cap reached |
| `upstream_error` | 500 | Upstream provider error |
| `gateway_timeout` | 500 | Upstream provider timed out |
| `internal_error` | 500 | Server error |
| `parse_error` | — | Response body could not be parsed (SDK-level) |

### Streaming errors

Mid-stream errors (sent as SSE frames before `[DONE]`) are automatically detected and thrown as `MeshAPIApiError` within the `for await` loop:

```ts
try {
  for await (const chunk of stream) {
    process.stdout.write(chunk.choices[0]?.delta.content ?? "");
  }
} catch (err) {
  if (err instanceof MeshAPIApiError) {
    // e.g. errorCode: "upstream_error", status: 0 (headers already sent)
    console.error("Stream error:", err.errorCode, err.message);
  }
}
```

---

## TypeScript

The SDK ships full `.d.ts` declarations. Key types:

```ts
import type {
  ChatCompletionParams,
  ChatCompletionResponse,
  ChatCompletionChunk,
  ChatMessage,
  ModelInfo,
  TemplateSummary,
  CreateTemplateParams,
  MeshAPIConfig,
} from "meshapi-node-sdk";
```

---

## Building from Source

```bash
git clone <repo>
cd meshapi-node-sdk
npm install
npm run build       # outputs to dist/
npm run typecheck   # type-check without emitting
```

---

## Requirements

- **Node.js** >= 18 (uses native `fetch`, `AbortSignal.timeout`, `ReadableStream`)
- **Zero runtime dependencies**
