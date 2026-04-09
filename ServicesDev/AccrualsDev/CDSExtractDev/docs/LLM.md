# CDSExtractDev — Playwright bootstrap

## Purpose
CDSExtractDev is the Costco-side extractor microservice under `ServicesDev/AccrualsDev`.

This service owns:
- Saving authenticated Playwright storage state for Costco.
- Recording Costco UI workflows from authenticated state.
- Capturing Excel downloads into a service-local artifacts folder.

## Portal
- CDS portal URL: `https://portal-cdsus.demosystem.net/#/`

## Commands
Run these from `ServicesDev/AccrualsDev/CDSExtractDev`.

1. Install dependencies:
   - `npm install`
2. (One-time or when session expires) Create auth state:
   - `npm run auth:setup`
3. Record authenticated workflow into generated spec:
   - `npm run record:auth`
4. Run an authenticated session that waits for a download and saves it:
   - `npm run download:run`

## Auth + artifacts
- Auth file: `playwright/.auth/cds.json`
- Codegen output: `generated/cds.codegen.spec.ts`
- Download output: `artifacts/downloads/*`

## Notes
- `record:auth` uses Playwright codegen with `--load-storage` so recording starts logged in.
- `download:run` intentionally opens headed Chromium and waits for any download event from the authenticated context.
