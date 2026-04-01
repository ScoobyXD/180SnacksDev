# IRIDev — 180 Snacks IRI

## Purpose
180 Snacks pays for IRI/Costco sales data, but the current workflow is manual and slow (screenshots, spreadsheet updates, chart creation, reports, PowerPoints). This project replaces manual handoffs with a deterministic browser automation tool.【Legacy context】

## Current Program State (as of April 1, 2026)
- Browser automation for IRI login/navigation/export is in place.
- Download capture is in place and artifacts are being saved locally.
- Next milestone is extraction reliability hardening and cleaner handoff artifacts for downstream tools.


## Tool Boundary (updated)
IRIDev is responsible only for browser automation and report extraction from IRI to local artifacts/files.

- Owns: login, navigation, export/download capture, extraction metrics/artifacts.
- Does not own: downstream data normalization or Airtable sync pipeline logic.

Downstream transformation/sync is handled by sibling project `ExcelToAirtableDev`.

## Non-Goals (prototype boundaries)
- No AI agent behavior.
- No autonomous reasoning/planning.
- No Appium/mobile scope for now.

## Tool Philosophy
Build a **precise script** with fixed steps, fixed selectors, and explicit validation checks.

- Deterministic workflow (click/type/extract/output).
- Read-focused behavior only during extraction.
- Strong observability (logs, screenshots, traces, artifacts).
- Fast retries on transient UI/network issues.

## Delivery Scope (updated)
1. Log into IRI (browser automation).
2. Navigate to target report flow.
3. Extract report payload using one or more extraction techniques.
4. Save raw/local outputs for downstream processors.
5. Produce run summary metrics.

## Read-Only Safety Policy
After authentication and landing, switch into **strict read-only mode** for site interactions:

- Block any click attempt where target text/attributes contain write verbs like:
  - `save`, `submit`, `delete`, `remove`, `update`, `create`, `edit`, `apply`, `confirm`, `ok`, `send`, `post`
- Disallow non-GET requests in strict mode unless explicitly allowlisted.
- Fail fast if unsafe action is detected.
- Always capture screenshot + trace on safety violation.

> Note: Login may require POST/network writes; strict mode starts **after login**.

## Extraction Techniques to Evaluate (Speed + Reliability)
We explicitly support and compare these techniques:

### 1) DOM table extraction
- Read rendered grid/table rows/cells from page DOM.
- Pros: straightforward when tables are visible.
- Cons: brittle if UI layout changes, virtualized grids can be tricky.

### 2) Network interception
- Listen to report API responses (JSON payloads) and parse directly.
- Pros: often fastest + stable; cleaner data model.
- Cons: requires identifying relevant API calls and response formats.

### 3) File download automation (**primary current path**)
- Trigger XLSX export, capture download, parse file.
- Pros: official report output format and easiest alignment with business reference files.
- Cons: export latency and occasional format drift.

## Canonical Airtable Output Schema (authoritative)
The Airtable base must use the exact business columns represented in the reference output workbook:

1. `Item`
2. `Region`
3. `Venue`
4. `Week Ending`
5. `Date`
6. `Dollar Sales`
7. `Unit Sales`
8. `Inventory On Hand`
9. `Average Price per Unit`
10. `NSI Units On Hand`
11. `Refund Units`
12. `Average Inventory per Day`
13. `Average Coupon Value`
14. `Average Promoted Price`

> Important: The output Excel in `references/Output File` is a schema reference. Destination is Airtable, not an output XLSX export.

## Field Mapping Spec (Input ➜ Airtable)
Input headers currently observed in report exports:
- `Item`
- `Venue`
- `Dollar Sales`
- `Unit Sales`
- `Inventory On Hand`
- `Average Price per Unit`
- `NSI Units On Hand`
- `Refund Units`
- `Average Inventory per Day`
- `Average Coupon Value`
- `Average Promoted Price`

Deterministic mapping rules:
- `Item` (input) ➜ `Item` (airtable) using carry-forward when item cell is blank.
- `Venue` (input) ➜ `Venue` (airtable), preserving raw venue label.
- Numeric measure columns map 1:1 by column name.
- `Region` is **derived** from row hierarchy context (see row-type rules below).
- `Week Ending` is populated from run/report metadata (report selection context).
- `Date` is populated from run/report metadata or downstream date normalization policy.

Null/format handling:
- Empty cells become null (not empty strings).
- Numeric columns are stored as numbers.
- Preserve negative values (returns/refunds) as negative numbers.

## Row-Type Rules for IRI Hierarchy (deterministic)
The input report is hierarchical by row and must be normalized with context propagation.

### Row categories
- **Item header row**: `Item` populated and `Venue` often `Total US by Region`.
- **Region subtotal row**: `Item` blank and `Venue` appears as region-level label (e.g., indented region text).
- **Warehouse/detail row**: `Item` blank and `Venue` appears as warehouse-level label.

### Parsing/state rules
- Maintain `currentItem` = last non-empty `Item` encountered.
- Maintain `currentRegion` = last encountered region row within current item scope.
- For item header rows, set `Item=currentItem`, `Region=null` unless explicit region exists.
- For region rows, set `Region` to normalized region label; set `Venue` to original venue text.
- For warehouse rows, inherit `Region=currentRegion`; set `Venue` to warehouse label.

### Label normalization
- Preserve original `Venue` text for traceability.
- Optional normalized fields may be introduced later (`Venue Clean`, `Warehouse Number`) but do not replace core `Venue`.

## Upsert Key Strategy for Airtable
Use a deterministic composite key to make writes idempotent.

Recommended key:
- `record_key = hash(Item + '|' + Region + '|' + Venue + '|' + Week Ending)`

Behavior:
- If `record_key` exists: update record.
- If `record_key` does not exist: create record.
- Keep raw source metadata (`source_file`, `ingested_at`) for auditability.

## Parabola vs Code-First Decision Guidance
### Choose Parabola when
- Non-engineers must own/edit mappings frequently.
- You need rapid visual workflow iteration.
- Data volume is moderate and rate limits are manageable.

### Choose code-first (TypeScript in this repo) when
- You need strict version control + deterministic reproducibility.
- Hierarchy parsing logic is nuanced and evolving.
- You need stronger testability, CI, and error observability.

### Current recommendation
Given deterministic engineering goals and existing TypeScript automation stack, **code-first transformation + Airtable API sync is the primary recommendation**, with Parabola as optional fallback for operations-led maintenance.

## Performance & Reliability Experiment Plan
For each target report, log:

- End-to-end duration
- Extraction duration
- Transformation duration
- Airtable sync duration
- Row count (raw)
- Row count (normalized)
- Parse failures
- Mapping validation failures
- Airtable write failures/retries
- Data completeness score

Selection priorities:
1. Reliability first
2. Data completeness
3. Speed

## Iteration Plan (revised roadmap)
### Phase 0 — Recorder/bootstrap
- Use Playwright codegen to produce initial navigation/login script.
- Refactor generated code into maintainable helpers.

### Phase 1 — Read-only extractor prototype
- Implement strict read-only guard.
- Implement extraction methods.
- Save local artifacts only.

### Phase 2 — Technique comparison harness
- Add side-by-side DOM/network/download runners.
- Emit benchmark summary JSON.

### Phase 3 — Stabilization
- Selector fallback strategy.
- Better timeout/retry settings.
- Failure screenshots + traces.

### Phase 4 — Schema mapping specification (**current planning focus**)
- Finalize authoritative Airtable columns.
- Finalize input→output mapping rules.
- Finalize hierarchy/row-type parser rules.

### Phase 5 — Airtable integration
- Implement normalization pipeline from downloaded files.
- Implement idempotent Airtable upsert.
- Add sync metrics and failure artifacts.

### Phase 6 — Production hardening
- Backfill/replay support.
- Data quality checks and drift alerts.
- Runbook + operational ownership.

## Prototype Outputs
Each run should produce:
- `artifacts/raw/*.json` (raw extracted payload)
- `artifacts/normalized/*.json` (Airtable-ready records)
- `artifacts/rejects/*.json` (rows failing mapping/validation)
- `artifacts/screenshots/*.png` (step/failure evidence)
- `artifacts/metrics/*.json` (durations, row counts, retries)

## Definition of Done (next milestone)
- Can download target report consistently.
- Can parse hierarchical rows deterministically.
- Can produce Airtable-ready normalized records with required columns.
- Can upsert idempotently into Airtable with stable success.
- Can emit run metrics and reject artifacts for debugging.

## Auth Session Strategy (MFA-friendly)
To avoid automating email/MFA, we use a saved Playwright storage state.

### One-time setup
1. Run `npm run auth:setup`
2. Log in manually in the opened browser (including MFA/email confirmation)
3. Once fully logged in, return to terminal and press **Enter**
4. Script saves auth state to `playwright/.auth/iri.json`

### Normal runs
- `npm run run -- --mode=dom` (or `network` / `download`)
- Runner loads `playwright/.auth/iri.json` and starts from authenticated browser state.

### Security note
- `playwright/.auth/` is gitignored and should never be committed.

## Troubleshooting
### `ENOENT` when writing artifact files
If you see an error like missing artifact folders, ensure startup creates required directories.

### Run succeeds too fast with tiny duration
If extraction succeeds in a few hundred milliseconds, it likely extracted from the landing page instead of your target report.

### Download behavior notes
- If automation runs on your local PC, downloaded files are on your PC.
- Download mode captures the Playwright `Download` object and writes to `artifacts/downloads/`.
- If filename has no extension, infer extension from file signature before saving.
