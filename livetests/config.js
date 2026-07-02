import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sharedEnvPath = path.resolve(__dirname, "..", ".env.livetest");

function loadSharedEnv() {
  if (!fs.existsSync(sharedEnvPath)) return {};

  const values = {};
  for (const rawLine of fs.readFileSync(sharedEnvPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    value = value.replace(/^['"]|['"]$/g, "");
    if (key) values[key] = value;
  }
  return values;
}

const sharedEnv = loadSharedEnv();

export function env(name, fallback = undefined) {
  return process.env[name] ?? sharedEnv[name] ?? fallback;
}

export const BASE_URL = env("MESHAPI_BASE_URL", "http://localhost:8000");
export const TOKEN = env("MESHAPI_TOKEN", "rsk_01KN96KQWDPF2X1E9CP8567JY4");
export const MODEL = env("MESHAPI_MODEL", "openai/gpt-4o-mini");
const _secondModelFallback = MODEL === "anthropic/claude-haiku-4.5" ? "openai/gpt-4o-mini" : "anthropic/claude-haiku-4.5";
export const SECOND_MODEL = env("MESHAPI_SECOND_MODEL", _secondModelFallback);

// ── Strict-mode preflight (pre-hackathon gate) ──────────────────────────────
//
// Several feature tests skip-by-default when an env var is unset (image gen,
// vision, audio in/out, video). A skipped test reads as "passed" — so a green
// run can mean almost nothing ran. Set MESHAPI_STRICT_LIVETESTS=1 in the
// pre-hackathon gate: the run fails fast unless every optional-feature env var
// is present, forcing those tests to actually execute. See .env.livetest.example.
const STRICT_REQUIRED_ENV = [
  "MESHAPI_IMAGE_GEN_MODEL",
  "MESHAPI_IMAGE_URL",
  "MESHAPI_INPUT_AUDIO_B64",
  "MESHAPI_AUDIO_OUT_MODEL",
  "MESHAPI_VIDEO_GEN_MODEL",
];

if (["1", "true", "yes"].includes(String(env("MESHAPI_STRICT_LIVETESTS", "")).toLowerCase())) {
  const missing = STRICT_REQUIRED_ENV.filter((name) => !env(name));
  if (missing.length > 0) {
    console.error(
      "MESHAPI_STRICT_LIVETESTS is set but these env vars are unset, so their " +
        "feature tests would silently skip:\n  - " +
        missing.join("\n  - ") +
        "\nSet them (see .env.livetest.example) or unset MESHAPI_STRICT_LIVETESTS.",
    );
    process.exit(1);
  }
}
