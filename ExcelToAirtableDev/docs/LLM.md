# ExcelToAirtableDev — 180 Snacks data normalizer

## Purpose
This project is a focused transformation tool in the 180 Snacks tool ecosystem.

- **Input:** IRI-style Excel report export (`.xlsx`)
- **Prototype output:** cleaned/normalized Excel file (`.xlsx`)
- **Future output:** Airtable upsert

This project intentionally does not own browser automation. IRIDev owns extraction.

## Architecture role (small-tool strategy)
180 Snacks tooling should stay modular and swappable:
- `IRIDev`: Playwright extraction from IRI to local files
- `ExcelToAirtableDev`: data normalization (and later Airtable sync)
- `ShelfTagDev`: shelf-tag workflow

No behemoth app. Each tool does one job well.

## Prototype v0 scope (current)
1. Read a source XLSX dropped into this project.
2. Parse rows using fixed schema assumptions.
3. Keep **warehouse rows only**.
4. Carry-forward hierarchy context so each warehouse row has `Item` and `Region`.
5. Emit normalized output to a new XLSX file.

## Canonical output columns
Output workbook columns are exactly:
1. `Item`
2. `Region`
3. `Venue`
4. `Week Ending Date`
5. `Date` (must stay blank in current weekly-only workflow)
6. `Dollar Sales`
7. `Unit Sales`
8. `Inventory On Hand`
9. `Average Price per Unit`
10. `NSI Units On Hand`
11. `Refund Units`
12. `Average Inventory per Day`
13. `Average Coupon Value`
14. `Average Promoted Price`

## Deterministic parsing rules
- Week ending is detected only from top-of-sheet shape metadata (e.g., `Shape 1`), normalized to `MM-DD-YYYY`, and applied to every output row.
- Treat `Item` as the key context dimension.
- Drop totals rows (e.g., `Total US by Region`).
- Drop non-warehouse summary rows from output.
- Keep only rows where `Venue` identifies a warehouse.
- Carry `currentItem` from last non-empty `Item`.
- Carry `currentRegion` from last region row.
- Set `Date` to empty string for all rows.

- If week ending cannot be detected from Shape 1 metadata, the run fails fast to avoid blank week fields.

## Airtable sync (current)
- Optional Airtable sync is now supported behind environment flags.
- If `AIRTABLE_SYNC_ENABLED=true`, the script can find/create the base, find/create the table, then append normalized rows.
- If no `--input` is passed, the script auto-selects the newest `.xlsx` in `../IRIDev/artifacts/downloads`.

## Out of scope for v0
- No row-count validation gating yet.
- No cross-file backfill tooling yet.

## Test fixtures (planning)
Fixture rows are test-case mini datasets (5–10 representative rows) used to lock behavior:
- totals row dropped
- region row context set
- warehouse row emitted
- item carry-forward works
- date is blank
- negative values preserved

## CLI contract
`npm run run -- [--input=<path.xlsx>] [--output=<path.xlsx>]`

- `--input` optional. If omitted, newest raw IRIDev download is selected automatically.
- `--output` optional (auto timestamped default)
- Week ending is not accepted as CLI input; it is sourced from Shape 1 metadata only.
- Airtable sync is controlled with env vars (see `.env.example`), including smart base/table create options.
- Runtime automatically loads `.env` / `.env.local` from `ExcelToAirtableDev` before evaluating flags.

## Success criteria (v0)
- Given a known input workbook, output workbook is created.
- Output includes only warehouse rows.
- Every output row has `Item`, `Region`, `Venue` populated from deterministic rules.
- `Date` column is blank for all rows.


## Dependency note
- Runtime XLSX handling uses `exceljs` in order to avoid the unresolved high-severity advisory currently affecting the `xlsx` package in this workflow.
