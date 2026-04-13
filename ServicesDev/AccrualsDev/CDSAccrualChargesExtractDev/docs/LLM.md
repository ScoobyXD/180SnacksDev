# CDSExtractDev — Playwright bootstrap

## Purpose
CDSExtractDev is the Costco-side extractor microservice under `ServicesDev/AccrualsDev`.

## Commands
Run these from `ServicesDev/AccrualsDev/CDSExtractDev`.

1. Setup authenticated storage state:
   - `npm run auth:setup`
2. Record/update your generated Playwright steps:
   - `npm run record:auth`
3. Run the generated workflow:
   - `npm run run`

## Key paths
- Auth file: `playwright/.auth/cds.json`
- Codegen output: `generated/cds.codegen.spec.ts`
- Download output: browser/context default for your generated script
