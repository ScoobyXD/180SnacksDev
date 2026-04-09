import { promises as fs } from 'node:fs';
import path from 'node:path';
import { chromium, type BrowserContext, type Download, type Page } from 'playwright';

type RunMode = 'recorded' | 'download';

const deacomUrl = 'http://192.168.1.7:8081/';
const authPath = path.join('playwright', '.auth', 'deacom.json');
const downloadsDir = path.join('artifacts', 'downloads');

function getMode(): RunMode {
  const modeArg = process.argv.find((arg) => arg.startsWith('--mode='));
  const mode = (modeArg?.split('=')[1] ?? 'recorded') as RunMode;

  if (!['recorded', 'download'].includes(mode)) {
    throw new Error(`Unsupported mode "${mode}". Use --mode=recorded|download`);
  }

  return mode;
}

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

async function wakeSidebar(page: Page): Promise<void> {
  await page.mouse.move(20, 140);
  await page.waitForTimeout(400);
  await page.locator('#Menu_Links_Sales').waitFor({ state: 'visible', timeout: 15_000 });
}

async function runRecordedFlow(page: Page): Promise<void> {
  await page.goto(deacomUrl, { waitUntil: 'domcontentloaded' });

  // Deacom hides left-nav labels until hover/focus. Prime it first.
  await wakeSidebar(page);

  // Manual pause requested: 1 second.
  await page.waitForTimeout(1_000);

  // --------------------------------------------------------------------------
  // GENERATED STEPS SECTION (copy/paste from Playwright codegen here)
  // Keep this section in sync whenever you re-record.
  // --------------------------------------------------------------------------
  await page.getByRole('link', { name: /sales/i }).click();
  await page.locator('#Menu_Links_Sales').getByText('Order Reporting').click();
  await page.getByLabel('Report Type').selectOption('orddtl');
  await page.getByLabel('Status', { exact: true }).selectOption('All Orders');
  await page.getByRole('textbox', { name: 'Start Date' }).fill('01/01/2026');
  await page.getByRole('textbox', { name: 'Start Date' }).press('Enter');

  const endDate = new Date().toISOString().slice(0, 10);
  const [year, month, day] = endDate.split('-');
  await page.getByRole('textbox', { name: 'End Date' }).fill(`${month}/${day}/${year}`);
  await page.getByRole('textbox', { name: 'End Date' }).press('Enter');
  await page.locator('#ID100 > .ActionIcon > .material-icons').click();
  await page.locator('.SearchboxColumnInput').first().fill('edi allowance');
  await page.getByRole('gridcell', { name: 'EDI Allowance' }).nth(1).dblclick();
  await page.getByRole('link', { name: /view/i }).click();

  page.once('dialog', (dialog) => {
    console.log(`Dialog message: ${dialog.message()}`);
    void dialog.dismiss();
  });

  const page1Promise = page.waitForEvent('popup');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: /excel/i }).click();
  await page1Promise;

  const download = await downloadPromise;
  const saved = await saveDownload(download);
  console.log(`Saved download to ${saved}`);
  // --------------------------------------------------------------------------
}

async function runDownloadWaitMode(context: BrowserContext, page: Page): Promise<void> {
  await page.goto(deacomUrl, { waitUntil: 'domcontentloaded' });
  console.log('Authenticated browser opened. Perform your workflow until download starts.');

  const download = await context.waitForEvent('download', { timeout: 240_000 });
  const savedPath = await saveDownload(download);
  console.log(`Saved download to ${savedPath}`);
}

async function main(): Promise<void> {
  const mode = getMode();
  await assertAuthExists();

  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const context = await browser.newContext({
    storageState: authPath,
    acceptDownloads: true
  });
  const page = await context.newPage();

  try {
    if (mode === 'download') {
      await runDownloadWaitMode(context, page);
    } else {
      await runRecordedFlow(page);
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
