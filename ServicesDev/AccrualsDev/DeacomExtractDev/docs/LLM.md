# DeacomExtractDev — Playwright bootstrap

## Purpose
DeacomExtractDev is the Deacom ERP-side extractor microservice under `ServicesDev/AccrualsDev`.

This service owns:
- Saving authenticated Playwright storage state for Deacom.
- Recording Deacom UI workflows from authenticated state.
- Capturing Excel downloads into a service-local artifacts folder.

## Portal
- Deacom portal URL: `http://192.168.1.7:8081/`

## Commands
Run these from `ServicesDev/AccrualsDev/DeacomExtractDev`.

1. Install dependencies:
   - `npm install`
2. Install Playwright browser runtime:
   - `npm run pw:install`
3. (One-time or when session expires) Create auth state:
   - `npm run auth:setup`
   - Login/MFA in the opened browser, then press **Enter in terminal** to save auth state.
4. Record authenticated workflow into generated spec:
   - `npm run record:auth`
   - When done recording, close the codegen browser window (or stop the command).
5. Run the generated Playwright file (interactive UI mode, stays open):
   - `npm run run`
6. Run generated file one time and auto-exit when complete:
   - `npm run run:once`
7. Run generated file in headed debug mode (Inspector / step-through):
   - `npm run run:debug`
8. Run an authenticated session that waits for a download and saves it:
   - `npm run download:run`

## Auth + artifacts
- Auth file: `playwright/.auth/deacom.json`
- Codegen output: `generated/deacom.codegen.spec.ts`
- Download output: `artifacts/downloads/*`

## Notes
- `record:auth` uses Playwright codegen with `--load-storage` so recording starts logged in.
- You do **not** need to copy/paste code into another file to run the generated workflow; run the generated spec as-is with `npm run run` (UI mode) or `npm run run:once` (single run).
- `download:run` intentionally opens headed Chromium and waits for any download event from the authenticated context.
- `playwright.config.ts` sets `testDir` to `generated`, so run commands pick up your recorded `*.spec.ts` files (fixes the "No tests found" issue).
- `npm run run` uses `playwright test --ui`, which keeps the Playwright UI open instead of closing immediately.
