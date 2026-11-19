import { test } from "node:test";
import assert from "node:assert/strict";
import type { SearchMode } from "../src/types.v1-0-429";
import "../src/types.v1-0-429";

test("image frame fields serialise with their wire names", () => {
  const body = { prompt: "a spinning cube", frame_count: 8, frame_duration_ms: 120 };
  const parsed = JSON.parse(JSON.stringify(body));
  assert.equal(parsed.frame_count, 8);
  assert.equal(parsed.frame_duration_ms, 120);
});

test("omitted frame fields are not sent", () => {
  const body: Record<string, unknown> = { prompt: "a cube", frame_count: undefined };
  const parsed = JSON.parse(JSON.stringify(body));
  assert.equal("frame_count" in parsed, false);
  assert.equal("frame_duration_ms" in parsed, false);
});

test("search mode serialises as `mode`", () => {
  const modes: SearchMode[] = ["vector", "graph", "agentic"];
  for (const mode of modes) {
    const parsed = JSON.parse(JSON.stringify({ query: "q", mode }));
    assert.equal(parsed.mode, mode);
  }
});
