import { promises as fs } from 'node:fs';
import path from 'node:path';
import { chromium, type Download } from 'playwright';

const portalUrl = 'https://portal-cdsus.demosystem.net/#/';
const authPath = path.join('playwright', '.auth', 'cds.json');
const downloadsDir = path.join('artifacts', 'downloads');

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
    await page.locator('iframe[title="Data Visualization"]').contentFrame().getByRole('textbox', { name: 'From Date' }).fill('');
    await page.locator('iframe[title="Data Visualization"]').contentFrame().getByRole('textbox', { name: 'From Date' }).click();
    await page.locator('iframe[title="Data Visualization"]').contentFrame().getByRole('textbox', { name: 'From Date' }).fill('2/09/2026');
    await page.locator('iframe[title="Data Visualization"]').contentFrame().getByRole('textbox', { name: 'From Date' }).press('Enter');
    await page.getByRole('button', { name: 'Export to Excel' }).click();
    const page1Promise = page.waitForEvent('popup');
    const downloadPromise = page.waitForEvent('download');
    await page.locator('iframe[title="Data Visualization"]').contentFrame().locator('[data-test-id="DownloadLink"]').click();
    const page1 = await page1Promise;
    const download = await downloadPromise;

  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
