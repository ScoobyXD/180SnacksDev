# DeacomExtractDev — Playwright bootstrap

---

# ⚠️⚠️⚠️ STOP. READ THIS ENTIRE SECTION BEFORE YOU WRITE A SINGLE LINE OF CODE. ⚠️⚠️⚠️

# 🚨🚨🚨 DEACOM IS NOT A NORMAL WEB APP. 🚨🚨🚨

# If you skip this section, every locator you write will be flaky,
# every dropdown will reset itself, every fill() will silently fail,
# and you will waste HOURS debugging things that are already solved below.

# This is not optional reading. This is survival documentation.

---

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

## Hard rule for command wiring
- `npm run run` must execute only the maintained script (`src/index.mjs` in this project).
- `npm run run` must never execute `generated/*.codegen.spec.ts`.
- Generated codegen output is for recording/reference and should be run only via an explicit codegen command if added.


## How `npm run run` works
- It executes `src/index.mjs` directly (no ts-node loader).
- It loads auth from `playwright/.auth/deacom.json`.
- It applies the sidebar-prime workaround (`wakeSidebar`) so hidden Deacom labels become available.
- It uses resilient `openSalesMenu`/`openSalesAndClickOrderReporting` routines (DOM-id selectors like `#Menu_Sales`, hover-first open attempts, delayed clicks, physical mouse fallback, keyboard fallback, retry cycles) before choosing **Order Reporting**.
- If Sales still does not expand, the runner captures a debug screenshot to `artifacts/screenshots/` and throws.
- It includes an explicit manual delay (`await page.waitForTimeout(1000)`).
- The **GENERATED STEPS SECTION** in `src/index.mjs` is where you copy/paste updated codegen steps.
- Downloads are persisted to `artifacts/downloads`.

---

#  DEACOM QUIRKS — THE HARD-WON RULES 

**Every single rule below was discovered through painful trial and error. They are ALL real. Do not second-guess them. Do not "simplify" them away. They will bite you.**

---

### QUIRK 1: Sidebar is hover-driven — labels are hidden by default
- Menu label spans exist in DOM with `display: none` at page load.
- Labels only appear after mouse movement / hover across the sidebar.
- **You MUST run `wakeSidebar()` before interacting with any sidebar menu.**
- Because of this, role/text-only locators are flaky at initial load. **Prefer stable DOM IDs** (e.g. `#Menu_Sales`).

### QUIRK 2: `.click()` is NOT the same as a human click — HOVER FIRST, ALWAYS
- Deacom's sidebar menus listen on `mouseenter`/`mouseover` to open submenus, NOT on `click`.
- A Playwright `.click()` will visually select the menu item (it turns orange) but **the submenu will NOT open**.
- Your human click works because your hand naturally hovers before clicking. Playwright teleports and clicks instantly.
- **THE FIX:**
  ```js
  await element.hover();
  await page.waitForTimeout(300–500);
  await element.click({ delay: 100 });
  ```
- Treat success as **submenu content being visible**, not the menu item turning orange.

### QUIRK 3: NEVER use `.fill()` on search/autocomplete textboxes — use `pressSequentially()`
- `.fill()` sets the input value programmatically and **does NOT fire key events**.
- Deacom's search/autocomplete fields listen for individual `keydown → keypress → input → keyup` events to trigger filtering and dropdown population.
- `.fill()` will appear to type nothing. The field stays blank. You will lose your mind.
- **THE FIX:**
  ```js
  await page.locator('#theInput').click();
  await page.waitForTimeout(300);
  await page.locator('#theInput').pressSequentially('search term', { delay: 100 });
  await page.waitForTimeout(500); // let results populate
  ```

### QUIRK 4: Every form field change triggers an async refresh that RESETS other fields
- Changing a dropdown (e.g. Report Type) causes Deacom to fire an async request and **re-render the entire form**.
- If you set Field A, then immediately set Field B, the refresh from Field A will finish and **wipe Field B back to its default**.
- This is NOT anti-automation. It's a postback-era architecture running in a web wrapper.
- **THE FIX — wait for network idle after EVERY field change:**
  ```js
  await page.getByLabel('Report Type').selectOption('orddtl');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);

  await page.getByLabel('Status').selectOption('All Orders');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);

  // ...and so on for every field
  ```
- If fields still reset, use a verify-and-retry helper:
  ```js
  async function setAndVerify(locator, value, retries = 3) {
    for (let i = 0; i < retries; i++) {
      await locator.selectOption(value);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);
      const current = await locator.inputValue();
      if (current === value) return;
    }
    throw new Error(`Field kept resetting after ${retries} attempts`);
  }
  ```

### QUIRK 5: Event sequencing looks weird but is intentional
- You may see cursor movement around nearby icons (e.g. CRM/Sales region) before the final Sales open.
- This is part of the retry strategy to trigger Deacom's hover-driven UI state machine.
- **Do not remove these "unnecessary" hover steps. They are load-bearing.**

### QUIRK 6: If menu still fails, collect artifacts
- Runner writes screenshots to `artifacts/screenshots/` when Sales or Order Reporting cannot be opened.
- Keep those files with console attempt logs when debugging future regressions.

---

# TL;DR CHEAT SHEET FOR FUTURE LLMs

| You want to...               | Do NOT do this          | Do THIS instead                                    |
|-------------------------------|-------------------------|----------------------------------------------------|
| Click a sidebar menu          | `.click()`              | `.hover()` → wait 300ms → `.click({ delay: 100 })` |
| Type in a search box          | `.fill('text')`         | `.pressSequentially('text', { delay: 100 })`        |
| Set a dropdown value          | Set it and move on      | Set it → `waitForLoadState('networkidle')` → wait   |
| Check if a menu opened        | Check if it turned orange | Check if the **submenu content** is visible        |
| Interact with sidebar labels  | Use text locators       | Run `wakeSidebar()` first, then use DOM IDs         |

---

## Maintenance rule of thumb
- Keep `openSalesMenu` and `openSalesAndClickOrderReporting` intact unless Deacom UI behavior materially changes.
- Update only the **GENERATED STEPS SECTION** first when re-recording.
- If regressions return, inspect live DOM IDs before changing locator strategy.

## Key paths
- Auth file: `playwright/.auth/deacom.json`
- Codegen output: `generated/deacom.codegen.spec.ts`
- Scripted runner: `src/index.mjs`
- Download output: `artifacts/downloads/*`
