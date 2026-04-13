import { promises as fs } from 'node:fs';
import path from 'node:path';
import { chromium, type BrowserContext, type Download, type Frame, type Page } from 'playwright';

const portalUrl = 'https://portal-cdsus.demosystem.net/#/';
const authPath = path.join('playwright', '.auth', 'cds.json');
const downloadsDir = path.join('artifacts', 'downloads');
const downloadTimeoutMs = 120_000;
const reportRefreshMs = 8_000;

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

function getVisualizationFrame(page: Page): Frame {
  const frame = page.locator('iframe[title="Data Visualization"]').contentFrame();
  if (!frame) {
    throw new Error('Unable to locate "Data Visualization" iframe.');
  }
  return frame;
}

async function waitForReportRefresh(page: Page): Promise<void> {
  const frame = getVisualizationFrame(page);

  // CDS needs time to execute and render the report query after date entry.
  await page.waitForTimeout(reportRefreshMs);

  // Best-effort waits for common loading overlays/spinners in embedded dashboards.
  const loadingCandidates = [
    '.loading',
    '.loader',
    '.spinner',
    '.dx-loadpanel-content',
    '[aria-busy="true"]'
  ];

  for (const selector of loadingCandidates) {
    await frame.locator(selector).first().waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
  }
}

async function captureDownloadFromContext(
  context: BrowserContext,
  trigger: () => Promise<void>,
  timeoutMs = downloadTimeoutMs
): Promise<Download> {
  return new Promise<Download>((resolve, reject) => {
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const listeningPages = new Set<Page>();

    const onDownload = (download: Download) => {
      finish(() => resolve(download));
    };

    const subscribeToPage = (candidate: Page) => {
      if (listeningPages.has(candidate)) {
        return;
      }
      listeningPages.add(candidate);
      candidate.on('download', onDownload);
    };

    const unsubscribeAllPages = () => {
      for (const candidate of listeningPages) {
        candidate.off('download', onDownload);
      }
      listeningPages.clear();
    };

    const cleanup = () => {
      unsubscribeAllPages();
      context.off('page', onPageCreated);
      context.off('close', onContextClose);
      if (timer) {
        clearTimeout(timer);
      }
    };

    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      callback();
    };

    const onPageCreated = (createdPage: Page) => {
      subscribeToPage(createdPage);
    };

    const onContextClose = () => {
      finish(() => reject(new Error('Browser context closed before a download event was emitted.')));
    };

    for (const existingPage of context.pages()) {
      subscribeToPage(existingPage);
    }

    context.on('page', onPageCreated);
    context.on('close', onContextClose);

    timer = setTimeout(() => {
      finish(() => reject(new Error(`Timed out after ${timeoutMs}ms waiting for a download event.`)));
    }, timeoutMs);

    trigger().catch((error) => {
      finish(() => reject(error));
    });
  });
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

    const visualizationFrame = getVisualizationFrame(page);
    await visualizationFrame.getByRole('textbox', { name: 'From Date' }).click();
    await visualizationFrame.getByRole('textbox', { name: 'From Date' }).fill('2/09/2026');
    await visualizationFrame.getByRole('textbox', { name: 'From Date' }).press('Enter');

    await waitForReportRefresh(page);

    await page.getByRole('button', { name: 'Export to Excel' }).click();

    const popupPromise = page.waitForEvent('popup', { timeout: downloadTimeoutMs }).catch(() => undefined);
    const download = await captureDownloadFromContext(context, async () => {
      await visualizationFrame.locator('[data-test-id="DownloadLink"]').click();
    });

    const popup = await popupPromise;
    if (popup) {
      await popup.waitForLoadState('domcontentloaded').catch(() => undefined);
      await popup.close().catch(() => undefined);
    }

    const failure = await download.failure();
    if (failure) {
      throw new Error(`Download was started but did not complete: ${failure}`);
    }

    const saved = await saveDownload(download);
    const stats = await fs.stat(saved);
    if (stats.size === 0) {
      throw new Error(`Saved download is empty: ${saved}`);
    }

    console.log(`Saved download to ${saved} (${stats.size} bytes)`);
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
