import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { type Download, type Page, chromium } from 'playwright';
import { ensureArtifactDirectories, extractViaDomTable, extractViaNetworkCapture, saveArtifact, type ExtractionMode } from './extractors.js';
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

function buildFileName(download: Download): string {
  const suggested = download.suggestedFilename();
  if (suggested && suggested.trim().length > 0) {
    return suggested;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `iri-export-${stamp}.bin`;
}

async function runDownloadWorkflow(page: Page): Promise<Record<string, unknown>> {
  await page.locator('.fa.fa-grid-round').click();
  await page.getByText('Library').click();
  await page.getByText('(BP226) US Costco Small Vendor Report_PREMIUM', { exact: true }).click();
  await page.locator('a').filter({ hasText: /^More$/ }).click();
  await page.locator('#SBMore-listUI').getByText('Export').click();
  await page.getByText(/week ending/i).first().click();
  await page.locator('#btnexport').click();
  await page.locator('#export-form').getByText('OK').click();
  await page.locator('#user div').filter({ hasText: /^1$/ }).click();

  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
  await page.locator('#inbox').first().click();
  const download = await downloadPromise;

  const fileName = buildFileName(download);
  const artifactPath = path.join('artifacts', 'raw', fileName);
  const localDownloadsPath = path.join(os.homedir(), 'Downloads', fileName);

  await download.saveAs(artifactPath);
  await download.saveAs(localDownloadsPath);

  return {
    mode: 'download',
    fileName,
    artifactPath,
    localDownloadsPath
  };
}

async function main(): Promise<void> {
  const mode = getMode();
  await assertAuthStateExists();
  await ensureArtifactDirectories();

  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const context = await browser.newContext({
    storageState: authStatePath,
    recordVideo: { dir: 'artifacts/screenshots' },
    acceptDownloads: true
  });
  const page = await context.newPage();

  const runStart = Date.now();
  try {
    await page.goto(iriUrl, { waitUntil: 'domcontentloaded' });

    installReadOnlyNetworkGuard(page, [
      /auth/i,
      /session/i,
      /export/i,
      /download/i,
      /inbox/i,
      /attachment/i
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
        payload = await runDownloadWorkflow(page);
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
