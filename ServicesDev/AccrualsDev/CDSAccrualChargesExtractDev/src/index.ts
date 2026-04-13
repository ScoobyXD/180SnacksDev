import { promises as fs } from 'node:fs';
import path from 'node:path';
import { chromium, type Download } from 'playwright';
import { syncWorkbookToAirtable } from './airtableSync.js';

const portalUrl = 'https://portal-cdsus.demosystem.net/#/';
const authPath = path.join('playwright', '.auth', 'cds.json');
const downloadsDir = path.join('artifacts', 'downloads');
const downloadTimeoutMs = 120_000;

async function assertAuthExists(): Promise<void> {
  try {
    await fs.access(authPath);
  } catch {
    throw new Error(`Missing auth storage state at ${authPath}. Run "npm run auth:setup" first.`);
  }
}

async function saveDownload(download: Download): Promise<string> {
  await fs.mkdir(downloadsDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const suggested = download.suggestedFilename().replace(/\s+/g, '_');
  const target = path.join(downloadsDir, `${stamp}-${suggested}`);

  await download.saveAs(target);
  return target;
}

async function main(): Promise<void> {
  await assertAuthExists();

  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const context = await browser.newContext({
    storageState: authPath,
    acceptDownloads: true
  });

  const page = await context.newPage();

  try {
    await page.goto(portalUrl, { waitUntil: 'domcontentloaded' });

    await page.getByRole('button', { name: 'SELECT' }).click();
    await page.getByRole('link', { name: ' REPORTING' }).click();
    await page.getByRole('link', { name: 'Event Status Report' }).click();
    await page.locator('iframe[title="Data Visualization"]').contentFrame().getByRole('textbox', { name: 'From Date' }).click();
    await page.locator('iframe[title="Data Visualization"]').contentFrame().getByRole('textbox', { name: 'From Date' }).fill('2/09/2026');
    await page.locator('iframe[title="Data Visualization"]').contentFrame().getByRole('textbox', { name: 'From Date' }).press('Enter');
    await page.waitForTimeout(1500);

    await page.getByRole('button', { name: 'Export to Excel' }).click();
    const popupPromise = page.waitForEvent('popup');
    const downloadPromise = page.waitForEvent('download');
    await page.locator('iframe[title="Data Visualization"]').contentFrame().locator('[data-test-id="DownloadLink"]').click();

    const popup = await popupPromise;
    const download = await downloadPromise;
    const saved = await saveDownload(download);

    await popup.close().catch(() => undefined);
    console.log(`Saved download to ${saved}`);

    const airtableSync = await syncWorkbookToAirtable(saved);
    if (airtableSync.enabled) {
      console.log(`Airtable append complete: ${airtableSync.inserted}/${airtableSync.rowCount} rows inserted into ${airtableSync.tableName} (${airtableSync.baseId}).`);
    } else {
      console.log('Airtable sync skipped (AIRTABLE_SYNC_ENABLED is false).');
    }

  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
