# DeacomExtractDev — Playwright bootstrap

## Purpose
DeacomExtractDev is the Deacom ERP-side extractor microservice under `ServicesDev/AccrualsDev`.

## Commands
Run these from `ServicesDev/AccrualsDev/DeacomExtractDev`.

1. Setup authenticated storage state:
   - `npm run auth:setup`
2. Record/update your generated Playwright steps:
   - `npm run record:auth`
3. Run the maintained Deacom script:
   - `npm run run`

## How `npm run run` works
- It executes `src/index.mjs` directly (no ts-node loader).
- It loads auth from `playwright/.auth/deacom.json`.
- It applies the sidebar-prime workaround (`wakeSidebar`) so hidden Deacom labels become available.
- It includes an explicit manual delay (`await page.waitForTimeout(1000)`).
- The **GENERATED STEPS SECTION** in `src/index.mjs` is where you copy/paste updated codegen steps.
- Downloads are persisted to `artifacts/downloads`.

## Key paths
- Auth file: `playwright/.auth/deacom.json`
- Codegen output: `generated/deacom.codegen.spec.ts`
- Scripted runner: `src/index.mjs`
- Download output: `artifacts/downloads/*`
