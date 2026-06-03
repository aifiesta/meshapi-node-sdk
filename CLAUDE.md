# MeshAPI Node SDK

Official TypeScript/JavaScript client for the MeshAPI AI model gateway.

- **Package**: `meshapi-node-sdk`
- **Node.js**: 18+
- **Runtime dependencies**: none
- **Build output**: ESM (`dist/index.js`) + CJS (`dist/index.cjs`) + type declarations

## Project layout

```
node/
├── src/
│   ├── index.ts           # MeshAPI class and all public re-exports
│   ├── types.ts           # All TypeScript interfaces
│   ├── http.ts            # HttpClient (fetch-based), SSE parsing
│   ├── errors.ts          # MeshAPIApiError
│   └── resources/
│       ├── chat.ts        # /v1/chat/completions
│       ├── responses.ts   # /v1/responses
│       ├── embeddings.ts  # /v1/embeddings
│       ├── compare.ts     # /v1/compare
│       ├── files.ts       # /v1/files (batch file objects)
│       ├── rag.ts         # /v1/files RAG endpoints (upload, embed, search)
│       ├── batches.ts     # /v1/batches
│       ├── models.ts      # /v1/models
│       ├── templates.ts   # /v1/templates
│       ├── images.ts      # /v1/images/generations
│       └── videos.ts      # /v1/video/generations (BytePlus Seedance async)
├── tests/                 # Unit tests (contract, errors, SSE)
├── livetests/             # Live tests against a real backend
├── tsconfig.json
├── tsup.config.ts
└── package.json
```

## Common tasks

### Install dependencies

```bash
npm install
```

### Build (TypeScript → dist/)

```bash
npm run build
```

### Type-check without emitting

```bash
npm run typecheck
```

### Unit tests (no network)

```bash
npm test
```

Tests use Node's built-in test runner (`node:test`) + `tsx` for TypeScript.

### Adding a new resource

1. Add TypeScript interfaces to `src/types.ts` under a clearly labelled section comment.
2. Create `src/resources/<name>.ts` with a `<Name>Resource` class that takes `HttpClient` in its constructor.
3. Add a `readonly <name>: <Name>Resource` property to `MeshAPI` in `src/index.ts`.
4. Initialise it in the `MeshAPI` constructor.
5. Import the resource class at the top of `src/index.ts` and re-export the new types at the bottom.
6. Follow the pattern in `src/resources/templates.ts`.

---

## Live tests

Live tests hit a real MeshAPI backend. They live in `livetests/`, a separate npm package that installs the SDK from `..` via `"meshapi-node-sdk": "file:.."`.

### Prerequisites

- Node.js 18+.
- A running MeshAPI instance (default `http://localhost:8000`), **or** point at the dev API.
- A valid data-plane API key (`rsk_...`).

### Environment variables

Create `node/.env.livetest` (read automatically by `config.js`) or export the variables in your shell before running tests.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MESHAPI_BASE_URL` | No | `http://localhost:8000` | Base URL of the MeshAPI gateway |
| `MESHAPI_TOKEN` | **Yes** | hardcoded dev key | Data-plane API key (`rsk_...`) |
| `MESHAPI_MODEL` | No | `openai/gpt-4o-mini` | Primary model used in chat/stream tests |
| `MESHAPI_SECOND_MODEL` | No | `anthropic/claude-haiku-4.5` | Second model for compare tests |
| `MESHAPI_EMBEDDINGS_MODEL` | No | `openai/text-embedding-3-small` | Model used in embeddings tests |
| `MESHAPI_IMAGE_GEN_MODEL` | No | _(skipped if unset)_ | Image generation model; test skipped if blank |
| `MESHAPI_IMAGE_URL` | No | _(skipped if unset)_ | Publicly accessible image URL for vision tests |
| `MESHAPI_REALTIME_MODEL` | No | `openai/gpt-realtime-mini` | Realtime-capable model used in WebSocket live tests |
| `MESHAPI_VIDEO_GEN_MODEL` | No | _(skipped if unset)_ | BytePlus Seedance model for video generation tests; test skipped if blank |

Example `node/.env.livetest`:

```env
MESHAPI_BASE_URL=https://api-dev.meshapi.ai
MESHAPI_TOKEN=rsk_your_key_here
MESHAPI_MODEL=openai/gpt-4o-mini
MESHAPI_EMBEDDINGS_MODEL=openai/text-embedding-3-small
```

### Install live test dependencies

```bash
# Build the SDK first so the local package is up to date
npm run build

# Install live test deps (picks up the local SDK via file:..)
cd livetests
npm install
```

### Run all live tests

```bash
cd livetests
npm run test:all
```

### Run a single live test file

```bash
cd livetests
node --test test-rag.js
```

Or via the package script (add to `livetests/package.json` if not present):

```bash
node --test test-rag.js
```

### Available live test files

| File | What it tests |
|------|---------------|
| `test-chat.js` | Chat completions (basic, tools, multi-turn) |
| `test-stream.js` | Streaming chat and responses |
| `test-models.js` | Model listing |
| `test-templates.js` | Template CRUD lifecycle |
| `test-inference.js` | Embeddings, responses |
| `test-errors.js` | 401/404 error handling |
| `test-feature-matrix.js` | Cross-model feature matrix |
| `test-rag.js` | RAG upload → embed → list → search |
| `test-video.js` | Video generation create + poll lifecycle |
| `test-realtime.js` | WebSocket connect/close, session.created, session.update, error envelopes, on() callbacks, async iterator |

### RAG live test notes

The `"upload, embed, and search lifecycle"` test in `test-rag.js` does the following:
1. Calls `client.rag.initUpload(...)` with `embed: false`.
2. PUTs the file bytes directly to the returned `signed_url` via the global `fetch` API.
3. Waits up to 30 s for `upload_status=ready`.
4. Calls `client.rag.embed(...)` to trigger embedding.
5. Polls up to 90 s for `embedding_status=ready`.
6. Calls `client.rag.list(...)` and asserts the file appears.
7. Calls `client.rag.search(...)` scoped to the file ID and asserts non-empty results.
