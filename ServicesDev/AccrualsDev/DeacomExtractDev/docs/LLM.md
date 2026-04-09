# DeacomExtractDev — Playwright bootstrap

## Purpose
DeacomExtractDev is the Deacom ERP-side extractor microservice under `ServicesDev/AccrualsDev`.

This service owns:
- Saving authenticated Playwright storage state for Deacom.
- Recording Deacom UI workflows from authenticated state.
- Capturing Excel downloads into a service-local artifacts folder.

## Commands
Run these from `ServicesDev/AccrualsDev/DeacomExtractDev`.

1. Install dependencies:
   - `npm install`
2. (One-time or when session expires) Create auth state:
   - `npm run auth:setup`
3. Record authenticated workflow into generated spec:
   - `npm run record:auth`
4. Run an authenticated session that waits for a download and saves it:
   - `npm run download:run`

## Auth + artifacts
- Auth file: `playwright/.auth/deacom.json`
- Codegen output: `generated/deacom.codegen.spec.ts`
- Download output: `artifacts/downloads/*`

## Notes
- `record:auth` uses Playwright codegen with `--load-storage` so recording starts logged in.
- `download:run` intentionally opens headed Chromium and waits for any download event from the authenticated context.
