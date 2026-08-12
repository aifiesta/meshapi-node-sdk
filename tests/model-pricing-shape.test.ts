/**
 * `ModelPricing` must describe the pricing object the gateway actually returns.
 *
 * Found during the MESH-472 versioning audit: this SDK declares
 * `prompt_usd_per_1k` / `completion_usd_per_1k` as **required**, which prod stopped
 * returning in `v1.0.135` (they now have zero references anywhere in the gateway),
 * and it does not declare `input_usd_per_unit` / `output_usd_per_unit`, which are
 * what replaced them.
 *
 * In TypeScript that lands differently than in a runtime-validating SDK: the types
 * are erased, so nothing is *discarded* — instead the type **lies in both
 * directions**. `prompt_usd_per_1k` is typed as always present when it never is, and
 * reading `pricing.input_usd_per_unit` is a compile error, so a caller cannot get at
 * the rate at all without casting away the type they were given.
 *
 * That second half matters most for models that are not token-priced (per-second
 * video, per-image, per-1k-chars): their per-1M fields are null **by design**, so the
 * per-unit rate is the only price on the wire.
 *
 * Note this file is checked by `npm run typecheck`, not just `npm test` — for a
 * compile-time contract the type checker IS the test runner. `tsx` strips types
 * without checking them, so a missing field fails `tsc --noEmit` while the runtime
 * assertions below still pass. Both are needed: the types must permit the access,
 * and the values must actually be there.
 *
 * The pre-existing `model_list.json` fixture cannot catch any of this — it encodes
 * the old shape, so it asserts the SDK parses a response the gateway no longer
 * sends. `model_list_current.json` is what prod sends today.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

import type { ModelInfo } from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(__dirname, "fixtures", name), "utf8"));
}

describe("contract: ModelPricing, current shape", () => {
  const models = fixture("model_list_current.json") as ModelInfo[];

  it("a token-priced row exposes the per-unit rate", () => {
    // For token rows the per-unit rate equals the per-1M rate, so either is usable.
    const gpt = models.find(m => m.id === "openai/gpt-4o-mini");
    assert.ok(gpt?.pricing);
    assert.equal(gpt.pricing.pricing_unit, "per_1m_tokens");
    assert.equal(gpt.pricing.prompt_usd_per_1m, "0.15000000");
    assert.equal(gpt.pricing.input_usd_per_unit, "0.15000000");
    assert.equal(gpt.pricing.output_usd_per_unit, "0.60000000");
  });

  it("a non-token row has its rate ONLY in the per-unit fields", () => {
    // The case the missing fields actually broke. A per-second video model has null
    // for both per-1M fields — a per-1M-token figure is meaningless for it — so
    // input_usd_per_unit is the only place the price exists.
    const video = models.find(m => m.id === "bytedance/seedance-2-5");
    assert.ok(video?.pricing);
    assert.equal(video.pricing.pricing_unit, "per_second");
    assert.equal(video.pricing.prompt_usd_per_1m, null);
    assert.equal(video.pricing.completion_usd_per_1m, null);
    assert.equal(video.pricing.input_usd_per_unit, "10.70000000");
    assert.equal(video.pricing.output_usd_per_unit, "6.40000000");
  });

  it("the rate is only interpretable alongside pricing_unit", () => {
    // input_usd_per_unit is a bare number; pricing_unit is what makes it a price.
    // A response carrying one without the other is not usable.
    for (const m of models) {
      if (m.pricing?.input_usd_per_unit != null) {
        assert.ok(m.pricing.pricing_unit, `${m.id} has a rate but no pricing_unit`);
      }
    }
  });

  it("the retired per-1k fields are absent from a current response", () => {
    // The honest outcome of the drift: against a real gateway these are simply not
    // there. Typing them as required asserted the opposite.
    const gpt = models.find(m => m.id === "openai/gpt-4o-mini");
    assert.equal(gpt?.pricing?.prompt_usd_per_1k, undefined);
    assert.equal(gpt?.pricing?.completion_usd_per_1k, undefined);
  });

  it("still parses the retired shape", () => {
    // Kept declared, not deleted: a caller that still reads them keeps compiling.
    const legacy = fixture("model_list.json") as ModelInfo[];
    assert.equal(legacy[0]?.pricing?.prompt_usd_per_1k, "0.000150");
  });
});
