import { promises as fs } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const deacomUrl = 'http://192.168.1.7:8081/';
const authPath = path.join('playwright', '.auth', 'deacom.json');
const downloadsDir = path.join('artifacts', 'downloads');

async function assertAuthExists() {
  try {
    await fs.access(authPath);
  } catch {
    throw new Error(`Missing auth storage state at ${authPath}. Run "npm run auth:setup" first.`);
  }
}

async function saveDownload(download) {
  await fs.mkdir(downloadsDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const suggested = download.suggestedFilename().replace(/\s+/g, '_');
  const target = path.join(downloadsDir, `${stamp}-${suggested}`);

  await download.saveAs(target);
  return target;
}

async function wakeSidebar(page) {
  await page.mouse.move(20, 140);
  await page.waitForTimeout(400);
  await page.locator('#Menu_Links_Sales').waitFor({ state: 'visible', timeout: 15_000 });
}

async function openSalesMenu(page) {
  const salesLink = page.getByRole('link', { name: /sales/i });
  const salesMenu = page.locator('#Menu_Links_Sales');

  await salesLink.waitFor({ state: 'visible', timeout: 15_000 });
  await salesLink.click();
  await page.waitForTimeout(250);

  if (await salesMenu.isVisible()) {
    return;
  }

  // Deacom sometimes highlights Sales but does not open submenu on first synthetic click.
  await salesLink.hover();
  await page.waitForTimeout(200);
  await salesLink.click({ force: true });
  await page.waitForTimeout(300);

  if (await salesMenu.isVisible()) {
    return;
  }

  // Last resort: physical mouse click at center + keyboard Enter.
  const box = await salesLink.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.up();
  }
  await salesLink.focus();
  await page.keyboard.press('Enter');

  await salesMenu.waitFor({ state: 'visible', timeout: 10_000 });
}

async function main() {
  await assertAuthExists();

  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const context = await browser.newContext({
    storageState: authPath,
    acceptDownloads: true
  });
  const page = await context.newPage();

  try {
    await page.goto(deacomUrl, { waitUntil: 'domcontentloaded' });

    // Deacom hides left-nav labels until hover/focus. Prime it first.
    await wakeSidebar(page);

    // Manual pause requested: 1 second.
    await page.waitForTimeout(1_000);

    // --------------------------------------------------------------------------
    // GENERATED STEPS SECTION (copy/paste from Playwright codegen here)
    // Keep this section in sync whenever you re-record.
    // --------------------------------------------------------------------------
    await openSalesMenu(page);
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
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
