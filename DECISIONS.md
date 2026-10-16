# Decisions

## Contract drift gate

- `contract/openapi.public.json` is a committed public-subset snapshot copied from the
  published spec. The release orchestrator (sub-project #2 of the contract-gate work)
  refreshes it. Until then the gate catches SDK-side regressions only; spec-side changes
  arrive when the orchestrator updates the snapshot.
- `contract-baseline.json` (499 rows) is the known SDK-vs-spec gap. Code generation
  shrinks it; new rows are never added by hand to hide drift.
