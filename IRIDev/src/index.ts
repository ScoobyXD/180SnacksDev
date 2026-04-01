import { chromium } from 'playwright';
import { extractViaDomTable, extractViaNetworkCapture, saveArtifact, type ExtractionMode } from './extractors.js';
import { installReadOnlyNetworkGuard } from './readOnlyGuard.js';

const iriUrl = 'https://advantage.iriworldwide.com/unify-CRX/plus/landing/0';

function getMode(): ExtractionMode {
  const modeArg = process.argv.find((arg) => arg.startsWith('--mode='));
  const mode = (modeArg?.split('=')[1] ?? 'dom') as ExtractionMode;
  if (!['dom', 'network', 'download'].includes(mode)) {
    throw new Error(`Unsupported mode "${mode}". Use --mode=dom|network|download`);
  }
  return mode;
}

async function main(): Promise<void> {
  const mode = getMode();
  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const context = await browser.newContext({ recordVideo: { dir: 'artifacts/screenshots' } });
  const page = await context.newPage();

  const runStart = Date.now();
  try {
    await page.goto(iriUrl, { waitUntil: 'domcontentloaded' });

    // TODO: Replace this block with your generated codegen login + navigation flow.
    // Suggested process:
    // 1) run: npm run codegen
    // 2) copy the generated steps into a helper and replace fragile selectors
    // 3) after login completes, enable strict read-only network guard

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
        payload = {
          message: 'Download mode not implemented yet. Add report export click + download parsing.'
        };
        break;
    }

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
