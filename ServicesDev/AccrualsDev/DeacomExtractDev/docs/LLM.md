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
- It uses resilient `openSalesMenu`/`openSalesAndClickOrderReporting` routines (DOM-id selectors like `#Menu_Sales`, hover-first open attempts, delayed clicks, physical mouse fallback, keyboard fallback, retry cycles) before choosing **Order Reporting**.
- If Sales still does not expand, the runner captures a debug screenshot to `artifacts/screenshots/` and throws.
- It includes an explicit manual delay (`await page.waitForTimeout(1000)`).
- The **GENERATED STEPS SECTION** in `src/index.mjs` is where you copy/paste updated codegen steps.
- Downloads are persisted to `artifacts/downloads`.

## Deacom quirks learned (important)
- **Sidebar text is hover-driven and misleading in DOM**:
  - Menu label spans exist in DOM with inline style like `display: none`.
  - Labels visually appear only after hover/mouse movement across the sidebar.
  - Because of this, role/text-only locators can be flaky at initial load; prefer stable IDs (example: `#Menu_Sales`).
- **“Sales turned orange” does not always mean submenu opened**:
  - Deacom can accept focus/selected styling but still fail to open `#Menu_Links_Sales`.
  - We therefore treat success as **`Order Reporting` being visible**, not color/state of Sales.
- **Hover timing matters**:
  - Fast synthetic click can miss the submenu-open handler.
  - Runner intentionally performs hover-first attempts, delayed clicks, and slight mouse drift to trigger `mouseenter`/`mouseover` style logic.
- **Event sequencing can look weird but is intentional**:
  - You may see cursor movement around nearby icons (for example around CRM/Sales region) before final Sales open.
  - This is part of the retry strategy to trigger Deacom’s hover-driven UI state machine.
- **If menu still fails, collect artifacts**:
  - Runner writes screenshots to `artifacts/screenshots/` when Sales or Order Reporting cannot be opened.
  - Keep those files with console attempt logs when debugging future regressions.

## Maintenance rule of thumb
- Keep `openSalesMenu` and `openSalesAndClickOrderReporting` intact unless Deacom UI behavior materially changes.
- Update only the **GENERATED STEPS SECTION** first when re-recording.
- If regressions return, inspect live DOM IDs before changing locator strategy.

## Key paths
- Auth file: `playwright/.auth/deacom.json`
- Codegen output: `generated/deacom.codegen.spec.ts`
- Scripted runner: `src/index.mjs`
- Download output: `artifacts/downloads/*`
