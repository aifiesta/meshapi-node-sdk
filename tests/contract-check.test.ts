import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SPEC_PATH = join(ROOT, "contract", "openapi.public.json");
const BASELINE = join(ROOT, "contract-baseline.json");
const SPEC_VERSION = readFileSync(join(ROOT, ".meshapi-spec-version"), "utf8").trim();
const REQUIRED = process.env["REQUIRE_CONTRACT_GATE"] === "1";

function findPython(): string | null {
  for (const bin of [process.env["MESHAPI_CONTRACT_PYTHON"], "python3", "python"]) {
    if (!bin) continue;
    const probe = spawnSync(bin, ["-c", "import meshapi_contract.gate"], { encoding: "utf8" });
    if (probe.status === 0) return bin;
  }
  return null;
}

const python = findPython();
const built = existsSync(join(ROOT, "dist", "index.d.ts"));
// The contract-check workflow sets REQUIRE_CONTRACT_GATE so a missing engine fails instead of skipping.
const skip = !REQUIRED && (!python || !built) ? "needs built dist/ and python meshapi-contract" : false;

function dump(): Record<string, unknown> {
  const run = spawnSync(process.execPath, ["--import", "tsx/esm", "scripts/dump-surface.ts"], {
    cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout) as Record<string, unknown>;
}

function gate(spec: unknown, actual: unknown) {
  const dir = mkdtempSync(join(tmpdir(), "contract-check-"));
  writeFileSync(join(dir, "spec.json"), JSON.stringify(spec));
  writeFileSync(join(dir, "actual.json"), JSON.stringify(actual));
  return spawnSync(
    python!,
    ["-m", "meshapi_contract.gate", "--spec", join(dir, "spec.json"), "--actual", join(dir, "actual.json"),
      "--spec-version", SPEC_VERSION, "--baseline", BASELINE],
    { encoding: "utf8" },
  );
}

describe("contract drift gate", { skip }, () => {
  const spec = JSON.parse(readFileSync(SPEC_PATH, "utf8"));
  let actual: Record<string, unknown>;
  before(() => {
    actual = dump();
  });

  it("dumper emits the gate envelope", () => {
    assert.equal(actual["schema_version"], "1");
    assert.equal(actual["spec_version"], SPEC_VERSION);
    const fields = actual["model_fields"] as unknown[];
    const params = actual["params"] as unknown[];
    assert.ok(fields.length > 0 && params.length > 0);
    assert.ok(fields.every((f) => Array.isArray(f) && f.length === 2 && f.every((x) => typeof x === "string")));
    assert.ok(params.every((p) => typeof p === "string" && /^[A-Z]+ \/\S*:\S+$/.test(p)));
  });

  it("keys models by spec component name", () => {
    const fields = (actual["model_fields"] as string[][]).map((f) => f.join("."));
    assert.ok(fields.includes("ChatCompletionRequest.model"));
    assert.ok(fields.includes("Message.role"));
  });

  it("has no drift beyond the baseline", () => {
    const result = gate(spec, actual);
    assert.equal(result.status, 0, result.stdout);
  });

  it("fails on a new spec field", () => {
    const mutated = structuredClone(spec);
    mutated.components.schemas.ChatCompletionRequest.properties.zz_drift_probe = { type: "string" };
    const result = gate(mutated, actual);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /missing field: ChatCompletionRequest\.zz_drift_probe/);
  });

  it("fails on a new spec param", () => {
    const mutated = structuredClone(spec);
    (mutated.paths["/v1/chat/completions"].post.parameters ??= []).push(
      { name: "newparam", in: "query", schema: { type: "string" } },
    );
    const result = gate(mutated, actual);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /missing param: POST \/v1\/chat\/completions:newparam/);
  });

  it("fails when a surface member the SDK had is removed", () => {
    const stripped = { ...actual, model_fields: (actual["model_fields"] as string[][]).filter(
      ([m, f]) => !(m === "ChatCompletionRequest" && f === "model")) };
    const result = gate(spec, stripped);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /missing field: ChatCompletionRequest\.model/);
  });

  it("baseline has no stale entries", () => {
    const run = gate(spec, actual);
    assert.doesNotMatch(run.stderr, /stale baseline entries/);
  });
});
