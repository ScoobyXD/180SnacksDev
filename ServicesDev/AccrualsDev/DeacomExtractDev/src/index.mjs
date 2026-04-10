import { promises as fs } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const deacomUrl = 'http://192.168.1.7:8081/';
const authPath = path.join('playwright', '.auth', 'deacom.json');
const downloadsDir = path.join('artifacts', 'downloads');
const screenshotsDir = path.join('artifacts', 'screenshots');

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
  const orderReporting = salesMenu.getByText('Order Reporting');

  await salesLink.waitFor({ state: 'visible', timeout: 15_000 });

  const isExpanded = async () => orderReporting.isVisible();
  const settle = async () => page.waitForTimeout(350);

  const attempts = [
    async () => {
      console.log('Sales menu attempt 1: hover-only open');
      await salesLink.hover();
      await page.waitForTimeout(650);
    },
    async () => {
      console.log('Sales menu attempt 2: hover + click(delay)');
      await salesLink.hover();
      await page.waitForTimeout(500);
      await salesLink.click({ delay: 120 });
    },
    async () => {
      console.log('Sales menu attempt 3: drift-out + hover + click(delay)');
      const box = await salesLink.boundingBox();
      if (box) {
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        await page.mouse.move(x + 80, y);
        await page.waitForTimeout(150);
        await page.mouse.move(x, y);
      }
      await page.waitForTimeout(500);
      await salesLink.click({ delay: 120 });
    },
    async () => {
      console.log('Sales menu attempt 4: physical mouse click at center');
      const box = await salesLink.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { delay: 80 });
      }
    },
    async () => {
      console.log('Sales menu attempt 5: double click + slight drift right');
      const box = await salesLink.boundingBox();
      if (box) {
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        await page.mouse.move(x, y);
        await page.mouse.dblclick(x, y, { delay: 80 });
        await page.mouse.move(x + 20, y);
      }
    },
    async () => {
      console.log('Sales menu attempt 6: keyboard Enter on focused link');
      await salesLink.focus();
      await page.keyboard.press('Enter');
    }
  ];

  for (const attempt of attempts) {
    await attempt();
    await settle();
    if (await isExpanded()) {
      return;
    }
  }

  await page.screenshot({ path: `artifacts/screenshots/sales-menu-not-open-${Date.now()}.png`, fullPage: true });
  throw new Error('Failed to open Sales submenu after multiple interaction strategies.');
}

async function openSalesAndClickOrderReporting(page) {
  const orderReporting = page.locator('#Menu_Links_Sales').getByText('Order Reporting');

  for (let i = 1; i <= 5; i += 1) {
    await openSalesMenu(page);
    await page.waitForTimeout(100);

    if (await orderReporting.isVisible()) {
      await orderReporting.click();
      return;
    }

    console.log(`Order Reporting not visible after menu open cycle ${i}, retrying...`);
  }

  await page.screenshot({ path: `artifacts/screenshots/order-reporting-not-open-${Date.now()}.png`, fullPage: true });
  throw new Error('Sales opened but Order Reporting entry could not be clicked.');
}

async function main() {
  await assertAuthExists();
  await fs.mkdir(screenshotsDir, { recursive: true });

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
    await page.waitForTimeout(1_500);

    // Manual pause requested: 1 second.
    await page.waitForTimeout(1_000);

    // --------------------------------------------------------------------------
    // GENERATED STEPS SECTION (copy/paste from Playwright codegen here)
    // Keep this section in sync whenever you re-record.
    // --------------------------------------------------------------------------
    await openSalesAndClickOrderReporting(page);
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
