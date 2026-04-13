# CDSAccrualChargesExcelToAirtableDev

## Purpose
Uploads the raw CDS accrual charges Excel download into Airtable with no custom row transformations.

## Commands
Run from `ServicesDev/AccrualsDev/CDSAccrualChargesExcelToAirtableDev`:

1. `npm run run`
   - Loads env from `.envsoft`, `.env`, `.env.local`.
   - Finds the latest workbook in sibling extract project's `artifacts/downloads` unless `--input` is provided.
   - Creates/fetches Airtable base/table (based on env flags) and appends rows.
   - If table exists, it can auto-add missing columns (`AIRTABLE_ADD_MISSING_FIELDS=true`).

## Environment
Use `.env` (copy from `.env.example`) to set Airtable token/base/table values.

## Input resolution
- Preferred: `--input=/absolute/or/relative/path.xlsx`
- Default: auto-detect sibling extract folder named `CDSAccrualChargesExtract*` and pick latest `.xlsx` from `artifacts/downloads`.
