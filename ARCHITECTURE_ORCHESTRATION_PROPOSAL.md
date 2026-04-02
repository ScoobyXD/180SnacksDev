# 180 Snacks Microservices Orchestration Proposal

## Why this document
You now have two strong tools:
- `IRIDev` for deterministic extraction from IRI.
- `ExcelToAirtableDev` for deterministic normalization + Airtable load.

This proposal defines how to evolve from two scripts into a scalable, multi-tool/multi-agent microservice system.

## Current baseline (what is already good)
- Tool boundaries are already intentionally split between extraction and normalization/sync.
- `IRIDev` can emit artifacts + metrics by mode (`dom`, `network`, `download`).
- `ExcelToAirtableDev` can auto-discover latest IRIDev download and optionally create/find Airtable base/table.

## Core architecture direction

### 1) Keep each tool as a single-purpose worker service
Each service should expose one stable command contract:

- `iri-extractor` service
  - Input: extraction request (report id, date/week selector, mode)
  - Output: artifact pointer + metadata
- `excel-normalizer` service
  - Input: workbook artifact pointer + mapping profile id
  - Output: normalized dataset artifact + schema version
- `airtable-writer` service
  - Input: normalized artifact + destination profile id
  - Output: write stats (inserted/updated/skipped/errors)

This keeps IRIDev and ExcelToAirtable concerns decoupled while enabling independent upgrades.

### 2) Introduce explicit contracts between services
Use versioned JSON envelopes (not implicit file conventions) as the control-plane contract:

```json
{
  "specVersion": "1.0",
  "runId": "uuid",
  "tool": "iri-extractor",
  "status": "succeeded",
  "input": {"report": "BP226", "weekEnding": "2026-03-29"},
  "output": {
    "artifacts": [
      {
        "type": "xlsx/raw",
        "uri": "s3://... or file://...",
        "sha256": "..."
      }
    ]
  },
  "metrics": {"durationMs": 12345}
}
```

Key point: payload metadata and artifact URI are first-class; downstream services should never guess paths.

### 3) Add a lightweight orchestrator now (upgrade later)
Create a separate `PipelineOrchestrator` service that:
- Receives pipeline requests (`extract -> normalize -> load`).
- Builds a DAG from reusable steps.
- Executes with retries/timeouts/backoff.
- Persists step state and emits run-level events.

Start simple (Node service + queue + Postgres state table) and keep workflow definitions declarative so you can migrate to Temporal/Prefect later without rewriting business logic.

## Handling many input Excel formats and many Airtable targets

### Profile-driven mapping layer
Instead of hardcoding one parsing path, define two profile types:

1. **Input Profile** (how to read a workbook)
   - Header detection strategy
   - Row classification rules (item/region/warehouse)
   - Week-ending extraction strategy
   - Normalization functions

2. **Destination Profile** (how to write target Airtable table)
   - Table/base resolution policy
   - Field mapping map
   - Type coercion rules
   - Upsert key definition

The runtime then becomes:
`raw file + inputProfile + destinationProfile -> normalized canonical rows -> destination rows`

This gives you N×M compatibility without N×M custom scripts.

### Canonical schema in the middle
Keep one canonical internal record shape (your current 14-column schema + metadata), then transform to each Airtable destination profile.

Add metadata fields such as:
- `source_system`
- `source_file`
- `source_row_number`
- `pipeline_run_id`
- `ingested_at`
- `record_key`

## Orchestration and scheduling

### Event + schedule model
Support both triggers:
- **Scheduled**: weekly cron (e.g., every Sunday night UTC or local business time).
- **Event-driven**: when extractor finishes and emits `artifact.created`, trigger normalize step.

### Suggested run lifecycle
1. `pipeline.requested`
2. `step.started` (extract)
3. `step.succeeded` (extract) + artifact emitted
4. `step.started` (normalize)
5. `step.succeeded` (normalize) + artifact emitted
6. `step.started` (airtable load)
7. `step.succeeded` (load)
8. `pipeline.succeeded`

On failure emit `step.failed` with retryability classification.

### Retries and idempotency
- Extraction: retry for transient browser/network failures.
- Normalization: usually deterministic; retry only on I/O faults.
- Airtable writes: idempotent upsert required; retry on 429/5xx with exponential backoff + jitter.

## Folder and artifact layout standard

Adopt a run-scoped layout so every step can find inputs deterministically:

```text
artifacts/
  runs/
    <runId>/
      manifest.json
      extract/
        raw.xlsx
        metrics.json
        logs.ndjson
      normalize/
        normalized.json
        normalized.xlsx
        rejects.json
        metrics.json
      load/
        airtable-result.json
        metrics.json
```

Rules:
- Never overwrite across runs.
- Every artifact is content-hashed and listed in `manifest.json`.
- Relative step outputs are resolved from manifest, not hardcoded sibling directories.

## Multi-agent readiness (1-year target)

To support 10-20 tools concurrently:
- Build a **Tool Registry** (tool name, version, input schema, output schema, health endpoint).
- Require each tool to publish JSON schema for contracts.
- Add policy controls (which agent may invoke which tool/destination).
- Add observability baseline: trace id, run id, step id in every log line.

Agents then choose tools dynamically, but orchestration remains deterministic and auditable.

## Recommended near-term implementation roadmap

### Phase A (next 1-2 weeks)
- Add run manifest schema and runId to both IRIDev and ExcelToAirtable outputs.
- Split ExcelToAirtable into two explicit steps internally:
  - `normalize`
  - `load-airtable`
- Add `record_key` generation and upsert support in Airtable writer.

### Phase B (2-4 weeks)
- Stand up a minimal orchestrator service (queue + worker model).
- Move direct path coupling to artifact-URI + manifest contract.
- Add weekly scheduler and manual re-run API.

### Phase C (1-2 months)
- Add profile system for multiple input/output formats.
- Add quality gates (required columns, row count thresholds, duplicate detection).
- Add dead-letter queue and replay tooling.

## Practical decisions to lock now
1. Canonical schema name and versioning policy.
2. Artifact URI standard (`file://` now, `s3://` later).
3. Idempotency key standard (`record_key`).
4. Orchestration engine choice for next 6 months.
5. Observability format (JSON logs + OpenTelemetry trace ids).

---

If you want, next I can convert this into:
- a concrete `pipeline.yaml` spec,
- JSON schemas for each step contract,
- and a starter orchestrator repo skeleton (API + worker + queue).
