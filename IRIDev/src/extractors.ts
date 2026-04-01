import { promises as fs } from 'node:fs';
import path from 'node:path';
import { type Page } from 'playwright';

export type ExtractionMode = 'dom' | 'network' | 'download';

export async function ensureArtifactDirectories(): Promise<void> {
  await Promise.all([
    fs.mkdir(path.join('artifacts', 'raw'), { recursive: true }),
    fs.mkdir(path.join('artifacts', 'normalized'), { recursive: true }),
    fs.mkdir(path.join('artifacts', 'metrics'), { recursive: true }),
    fs.mkdir(path.join('artifacts', 'screenshots'), { recursive: true })
  ]);
}

export async function extractViaDomTable(page: Page): Promise<Record<string, unknown>[]> {
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('table tr'));
    if (rows.length === 0) {
      return [];
    }

    const headerCells = Array.from(rows[0].querySelectorAll('th,td')).map((cell) =>
      (cell.textContent ?? '').trim() || 'column'
    );

    return rows.slice(1).map((row) => {
      const cells = Array.from(row.querySelectorAll('td'));
      const record: Record<string, unknown> = {};
      cells.forEach((cell, i) => {
        const key = headerCells[i] ?? `column_${i + 1}`;
        record[key] = (cell.textContent ?? '').trim();
      });
      return record;
    });
  });
}

export async function extractViaNetworkCapture(page: Page, timeoutMs = 20_000): Promise<unknown[]> {
  const captured: unknown[] = [];

  const handler = async (response: { url: () => string; headers: () => Record<string, string>; json: () => Promise<unknown> }) => {
    const contentType = response.headers()['content-type'] ?? '';
    if (!contentType.includes('application/json')) {
      return;
    }

    const url = response.url();
    if (!/report|sales|data|metric/i.test(url)) {
      return;
    }

    try {
      captured.push(await response.json());
    } catch {
      // Ignore non-JSON parse errors for now.
    }
  };

  page.on('response', handler as never);
  await page.waitForTimeout(timeoutMs);
  page.off('response', handler as never);

  return captured;
}

export async function saveArtifact(type: 'raw' | 'normalized' | 'metrics', name: string, data: unknown): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const directory = path.join('artifacts', type);
  await fs.mkdir(directory, { recursive: true });

  const filePath = path.join(directory, `${stamp}-${name}.json`);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  return filePath;
}
