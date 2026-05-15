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
const _secondModelFallback = MODEL === "anthropic/claude-haiku-4-5" ? "openai/gpt-4o-mini" : "anthropic/claude-haiku-4-5";
export const SECOND_MODEL = env("MESHAPI_SECOND_MODEL", _secondModelFallback);
