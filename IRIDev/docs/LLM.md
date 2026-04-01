# IRIDev — 180 Snacks IRI

## Purpose
180 Snacks pays for IRI/Costco sales data, but the current workflow is manual and slow (screenshots, spreadsheet updates, chart creation, reports, PowerPoints). This project replaces manual handoffs with a deterministic browser automation tool.【Legacy context】

## Non-Goals (for prototype v0)
- No AI agent behavior.
- No autonomous reasoning/planning.
- No Airtable writes yet (read/extract only first).
- No Appium/mobile scope for now.

## Tool Philosophy
Build a **precise script** with fixed steps, fixed selectors, and explicit validation checks.

- Deterministic workflow (click/type/extract/output).
- Read-focused behavior only.
- Strong observability (logs, screenshots, traces, artifacts).
- Fast retries on transient UI/network issues.

## Initial Scope (v0)
1. Log into IRI (browser automation).
2. Navigate to one target report flow.
3. Extract data via one or more extraction techniques.
4. Save normalized outputs locally (JSON/CSV artifacts).
5. Produce run summary metrics.

## Read-Only Safety Policy
After authentication and landing, switch into **strict read-only mode**:

- Block any click attempt where target text/attributes contain write verbs like:
  - `save`, `submit`, `delete`, `remove`, `update`, `create`, `edit`, `apply`, `confirm`, `ok`, `send`, `post`
- Disallow non-GET requests in strict mode unless explicitly allowlisted.
- Fail fast if unsafe action is detected.
- Always capture screenshot + trace on safety violation.

> Note: Login may require POST/network writes; strict mode starts **after login**.

## Extraction Techniques to Evaluate (Speed + Reliability)
We will explicitly test these three techniques and compare outcomes:

### 1) DOM table extraction
- Read rendered grid/table rows/cells from page DOM.
- Pros: straightforward when tables are visible.
- Cons: brittle if UI layout changes, virtualized grids can be tricky.

### 2) Network interception
- Listen to report API responses (JSON payloads) and parse directly.
- Pros: usually fastest + most stable; cleaner data model.
- Cons: requires identifying relevant API calls and response formats.

### 3) File download automation
- Trigger CSV/XLSX export, capture download, parse file.
- Pros: often officially supported output.
- Cons: export latency and occasional format drift.

## Performance & Reliability Experiment Plan
For each target report, run all supported extraction techniques over the same time window and log:

- End-to-end duration
- Extraction duration
- Row count
- Parse failures
- Selector failures
- Retry count
- Data completeness score

Select primary strategy per report using:
1. Reliability first (consistent success)
2. Data completeness
3. Speed

## Iteration Plan
### Phase 0 — Recorder/bootstrap
- Use Playwright codegen to produce initial navigation/login script.
- Refactor generated code into maintainable page/workflow helpers.

### Phase 1 — Read-only extractor prototype
- Implement strict read-only guard.
- Implement at least one report extraction method.
- Output local artifacts only (no Airtable).

### Phase 2 — Technique comparison harness
- Add side-by-side DOM/network/download runners.
- Emit benchmark summary JSON.

### Phase 3 — Stabilization
- Selector fallback strategy.
- Better timeout/retry settings.
- Failure screenshots + Playwright traces.

### Phase 4 — Destination integration
- Add Airtable upsert pipeline only after extraction quality is proven.

## Codegen Usage Guidance
Use Playwright codegen to accelerate first scripts:

1. Run codegen against IRI login/report flow.
2. Capture baseline interactions.
3. Move generated selectors into constants.
4. Replace fragile selectors with role/label/test-id locators where possible.
5. Wrap clicks with read-only guard helper.

## Prototype Outputs
Each run should produce:
- `artifacts/raw/*.json` (raw extracted payload)
- `artifacts/normalized/*.json` (clean schema)
- `artifacts/screenshots/*.png` (step/failure evidence)
- `artifacts/metrics/*.json` (durations, row counts, retries)

## Definition of Done (v0)
- Can login and reach target report flow.
- Can run in strict read-only mode post-login.
- Can extract and save local data artifacts.
- Can run repeatedly with stable success.
- No Airtable writes yet.

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
If you see an error like missing `artifacts/metrics/...json`, it means artifact folders were not present.
The runner now creates required folders automatically at startup.

### After auth browser closes, what next?
1. Confirm `playwright/.auth/iri.json` exists.
2. Run `npm run run -- --mode=dom`.
3. If run opens IRI and then exits/fails quickly, add your post-login codegen navigation steps into `src/index.ts` TODO section.
4. Re-run and verify `artifacts/raw` and `artifacts/metrics` JSON files are created.

### Run succeeds too fast with tiny duration
If `npm run run -- --mode=dom` succeeds in a few hundred milliseconds, it likely extracted from the landing page instead of your target report.

- The runner now throws if DOM/network extraction returns zero records.
- Fix by adding your real post-login report-navigation steps from codegen in `src/index.ts` before extraction.
