import { promises as fs } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
  ensureArtifactDirectories,
  extractViaDomTable,
  extractViaNetworkCapture,
  saveArtifact,
  saveDownloadArtifact,
  type ExtractionMode
} from './extractors.js';
import { installReadOnlyNetworkGuard } from './readOnlyGuard.js';

const iriUrl = 'https://advantage.iriworldwide.com/unify-CRX/plus/landing/0';
const authStatePath = path.join('playwright', '.auth', 'iri.json');

function getMode(): ExtractionMode {
  const modeArg = process.argv.find((arg) => arg.startsWith('--mode='));
  const mode = (modeArg?.split('=')[1] ?? 'dom') as ExtractionMode;
  if (!['dom', 'network', 'download'].includes(mode)) {
    throw new Error(`Unsupported mode "${mode}". Use --mode=dom|network|download`);
  }
  return mode;
}

async function assertAuthStateExists(): Promise<void> {
  try {
    await fs.access(authStatePath);
  } catch {
    throw new Error(
      `Missing auth storage state at ${authStatePath}. Run "npm run auth:setup" first, login in the browser, and press Enter to save.`
    );
  }
}


function assertNonEmptyExtraction(mode: ExtractionMode, payload: unknown): void {
  if (mode === 'download') {
    return;
  }

  if (Array.isArray(payload) && payload.length === 0) {
    throw new Error(
      `Extraction returned 0 records in mode=${mode}. This usually means report-navigation steps from codegen have not been added yet.`
    );
  }
}

async function main(): Promise<void> {
  const mode = getMode();
  await assertAuthStateExists();
  await ensureArtifactDirectories();

  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const context = await browser.newContext({
    storageState: authStatePath,
    acceptDownloads: true,
    recordVideo: { dir: 'artifacts/screenshots' }
  });
  const page = await context.newPage();

  const runStart = Date.now();
  try {
    await page.goto(iriUrl, { waitUntil: 'domcontentloaded' });
    await page.goto('https://advantage.iriworldwide.com/unify-CRX/plus/landing/0');
    await page.locator('.fa.fa-grid-round').click();
    await page.getByText('Library').click();
    await page.getByText('(BP226) US Costco Small Vendor Report_PREMIUM', { exact: true }).click();
    await page.locator('a').filter({ hasText: /^More$/ }).click();
    await page.locator('#SBMore-listUI').getByText('Export').click();
    await page.getByText('week ending 03-29-2026').click();
    await page.locator('#btnexport').click();
    await page.locator('#export-form').getByText('OK').click();
    await page.locator('#user div').filter({ hasText: /^1$/ }).click();

    // In strict mode, only GET/HEAD/OPTIONS requests are allowed unless allowlisted.
    installReadOnlyNetworkGuard(page, [
      /auth/i,
      /session/i
    ]);

    let payload: unknown;
    switch (mode) {
      case 'dom':
        payload = await extractViaDomTable(page);
        break;
      case 'network':
        payload = await extractViaNetworkCapture(page);
        break;
      case 'download':
        {
          const downloadPromise = page.waitForEvent('download', { timeout: 120_000 });
          await page.locator('#inbox').getByText('(BP226) US Costco Small').click();
          const download = await downloadPromise;
          const saved = await saveDownloadArtifact(download, '(BP226)-US-Costco-Small-Vendor-Report_PREMIUM');
          payload = {
            message: 'Report download captured and persisted to local artifacts/downloads.',
            suggestedFilename: download.suggestedFilename(),
            ...saved
          };
        }
        break;
    }

    assertNonEmptyExtraction(mode, payload);

    const rawPath = await saveArtifact('raw', `${mode}-extract`, payload);
    const metrics = {
      mode,
      success: true,
      durationMs: Date.now() - runStart,
      output: rawPath
    };
    const metricPath = await saveArtifact('metrics', `${mode}-metrics`, metrics);
    console.log(JSON.stringify({ metrics, metricPath }, null, 2));
  } catch (error) {
    await page.screenshot({ path: `artifacts/screenshots/failure-${Date.now()}.png`, fullPage: true });
    const metrics = {
      mode,
      success: false,
      durationMs: Date.now() - runStart,
      error: error instanceof Error ? error.message : String(error)
    };
    await saveArtifact('metrics', `${mode}-metrics-failure`, metrics);
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
