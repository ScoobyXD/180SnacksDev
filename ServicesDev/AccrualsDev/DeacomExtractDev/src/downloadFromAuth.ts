import { promises as fs } from 'node:fs';
import path from 'node:path';
import { chromium, type Download } from 'playwright';

const deacomUrl = 'https://customer.deacom.com/';
const authPath = path.join('playwright', '.auth', 'deacom.json');
const downloadsDir = path.join('artifacts', 'downloads');

async function assertAuthExists(): Promise<void> {
  try {
    await fs.access(authPath);
  } catch {
    throw new Error(`Missing auth storage state at ${authPath}. Run \"npm run auth:setup\" first.`);
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

  await page.goto(deacomUrl, { waitUntil: 'domcontentloaded' });
  console.log('Authenticated browser opened. Perform your workflow until download starts.');

  const download = await context.waitForEvent('download', { timeout: 240_000 });
  const savedPath = await saveDownload(download);

  console.log(`Saved download to ${savedPath}`);

  await context.close();
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
