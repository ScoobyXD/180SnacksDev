import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ExcelJS = require('../../../../ExcelToAirtableDev/node_modules/exceljs');

const BATCH_SIZE = 10;

function parseEnvText(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = text.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) {
      continue;
    }

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    out[key] = value;
  }

  return out;
}

function loadEnvFileIfPresent(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const parsed = parseEnvText(fs.readFileSync(filePath, 'utf8'));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function loadRuntimeEnv(): void {
  const repoRoot = path.resolve(process.cwd(), '..', '..', '..');
  const candidates = [
    path.resolve(process.cwd(), '.envsoft'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '.env.local'),
    path.join(repoRoot, '180SnacksRTSDev', '.envsoft')
  ];

  for (const filePath of candidates) {
    loadEnvFileIfPresent(filePath);
  }
}

function toBoolean(value: string | undefined): boolean {
  return String(value ?? '').toLowerCase() === 'true';
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getAirtableConfig(): {
  enabled: boolean;
  token?: string;
  baseId?: string;
  workspaceId?: string;
  baseName?: string;
  tableName?: string;
  createBaseIfMissing?: boolean;
  createTableIfMissing?: boolean;
} {
  const enabled = toBoolean(process.env.AIRTABLE_SYNC_ENABLED);
  if (!enabled) {
    return { enabled: false };
  }

  const baseId = process.env.AIRTABLE_BASE_ID || undefined;
  const workspaceId = process.env.AIRTABLE_WORKSPACE_ID || undefined;
  const baseName = process.env.AIRTABLE_BASE_NAME || undefined;

  if (!baseId && (!workspaceId || !baseName)) {
    throw new Error(
      'Set AIRTABLE_BASE_ID, or set AIRTABLE_WORKSPACE_ID + AIRTABLE_BASE_NAME so the base can be found/created.'
    );
  }

  return {
    enabled: true,
    token: getRequiredEnv('AIRTABLE_TOKEN'),
    baseId,
    workspaceId,
    baseName,
    tableName: getRequiredEnv('AIRTABLE_TABLE_NAME'),
    createBaseIfMissing: toBoolean(process.env.AIRTABLE_CREATE_BASE_IF_MISSING),
    createTableIfMissing: toBoolean(process.env.AIRTABLE_CREATE_TABLE_IF_MISSING)
  };
}

async function airtableRequest(url: string, token: string, method = 'GET', body?: unknown): Promise<any> {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    throw new Error(`Airtable API request failed (${response.status} ${response.statusText}): ${await response.text()}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

function inferFieldType(name: string, sampleValues: Array<string | number | boolean | null>): { name: string; type: string; options?: unknown } {
  const compact = sampleValues.filter((value) => value !== null);
  if (!compact.length) {
    return { name, type: 'singleLineText' };
  }

  const allNumeric = compact.every((value) => typeof value === 'number');
  if (allNumeric) {
    return { name, type: 'number', options: { precision: 4 } };
  }

  const allBoolean = compact.every((value) => typeof value === 'boolean');
  if (allBoolean) {
    return { name, type: 'checkbox', options: { icon: 'check', color: 'greenBright' } };
  }

  return { name, type: 'singleLineText' };
}

function normalizeCellValue(value: any): string | number | boolean | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'object') {
    if ('result' in value && value.result !== undefined && value.result !== null) {
      return normalizeCellValue(value.result as any);
    }
    if ('text' in value && typeof value.text === 'string') {
      return value.text;
    }
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text ?? '').join('');
    }
  }

  return String(value);
}

function isEmptyRow(values: Array<string | number | boolean | null>): boolean {
  return values.every((value) => value === null || String(value).trim() === '');
}

export function findLatestDownloadedWorkbook(): string {
  const downloadsDir = path.resolve(process.cwd(), 'artifacts', 'downloads');
  if (!fs.existsSync(downloadsDir)) {
    throw new Error(`Downloads directory not found: ${downloadsDir}`);
  }

  const candidates = fs.readdirSync(downloadsDir)
    .filter((name) => /\.xlsx$/i.test(name))
    .map((name) => {
      const fullPath = path.join(downloadsDir, name);
      return { fullPath, mtimeMs: fs.statSync(fullPath).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  if (!candidates.length) {
    throw new Error(`No .xlsx files found in ${downloadsDir}`);
  }

  return candidates[0].fullPath;
}

async function extractWorkbookRows(filePath: string): Promise<{ headers: string[]; rows: Array<Record<string, string | number | boolean | null>> }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error(`Workbook has no worksheets: ${filePath}`);
  }

  let headerRowIndex = -1;
  const allRows: Array<Array<string | number | boolean | null>> = [];

  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const values: Array<string | number | boolean | null> = [];

    for (let col = 1; col <= worksheet.columnCount; col += 1) {
      values.push(normalizeCellValue(row.getCell(col).value));
    }

    allRows.push(values);
    if (headerRowIndex < 0 && !isEmptyRow(values)) {
      headerRowIndex = rowNumber - 1;
    }
  }

  if (headerRowIndex < 0) {
    throw new Error(`Workbook is empty: ${filePath}`);
  }

  const headers = allRows[headerRowIndex].map((value, index) => {
    const label = String(value ?? '').trim();
    return label || `Column_${index + 1}`;
  });

  const rows = allRows
    .slice(headerRowIndex + 1)
    .filter((values) => !isEmptyRow(values))
    .map((values) => {
      const record: Record<string, string | number | boolean | null> = {};
      for (let i = 0; i < headers.length; i += 1) {
        record[headers[i]] = values[i] ?? null;
      }
      return record;
    });

  return { headers, rows };
}

async function ensureBaseAndTable(config: NonNullable<ReturnType<typeof getAirtableConfig>>, fieldNames: string[]): Promise<string> {
  const token = config.token as string;

  async function ensureTable(baseId: string): Promise<void> {
    const meta = await airtableRequest(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, token);
    const found = (meta.tables ?? []).find((table: any) => table.name === config.tableName);
    if (found) {
      return;
    }

    if (!config.createTableIfMissing) {
      throw new Error(`Table ${config.tableName} not found in base ${baseId}. Set AIRTABLE_CREATE_TABLE_IF_MISSING=true to create it.`);
    }

    await airtableRequest(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, token, 'POST', {
      name: config.tableName,
      fields: fieldNames.map((fieldName) => inferFieldType(fieldName, []))
    });
  }

  if (config.baseId) {
    await ensureTable(config.baseId);
    return config.baseId;
  }

  const basesPayload = await airtableRequest(
    `https://api.airtable.com/v0/meta/workspaces/${config.workspaceId}/bases`,
    token
  );

  const existing = (basesPayload.bases ?? []).find((base: any) => base.name === config.baseName);
  if (existing) {
    await ensureTable(existing.id);
    return existing.id;
  }

  if (!config.createBaseIfMissing) {
    throw new Error(`Base ${config.baseName} not found in workspace ${config.workspaceId}. Set AIRTABLE_CREATE_BASE_IF_MISSING=true to create it.`);
  }

  const created = await airtableRequest(
    `https://api.airtable.com/v0/meta/workspaces/${config.workspaceId}/bases`,
    token,
    'POST',
    {
      name: config.baseName,
      tables: [
        {
          name: config.tableName,
          fields: fieldNames.map((fieldName) => inferFieldType(fieldName, []))
        }
      ]
    }
  );

  return created.id;
}

async function appendRows(config: NonNullable<ReturnType<typeof getAirtableConfig>>, baseId: string, rows: Array<Record<string, string | number | boolean | null>>): Promise<number> {
  let inserted = 0;
  const token = config.token as string;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const payload = await airtableRequest(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(config.tableName as string)}`,
      token,
      'POST',
      {
        typecast: true,
        records: batch.map((fields) => ({ fields }))
      }
    );

    inserted += (payload.records ?? []).length;
  }

  return inserted;
}

export async function syncWorkbookToAirtable(inputPath?: string): Promise<{ inputPath: string; rowCount: number; inserted: number; baseId?: string; tableName?: string; enabled: boolean }> {
  loadRuntimeEnv();
  const config = getAirtableConfig();

  const resolvedInputPath = inputPath ?? findLatestDownloadedWorkbook();
  if (!config.enabled) {
    return {
      inputPath: resolvedInputPath,
      rowCount: 0,
      inserted: 0,
      enabled: false
    };
  }

  const { headers, rows } = await extractWorkbookRows(resolvedInputPath);
  const sampleByField = new Map<string, Array<string | number | boolean | null>>();
  for (const header of headers) {
    sampleByField.set(header, []);
  }
  for (const row of rows.slice(0, 100)) {
    for (const header of headers) {
      sampleByField.get(header)?.push(row[header] ?? null);
    }
  }

  const baseId = await ensureBaseAndTable(
    config as NonNullable<ReturnType<typeof getAirtableConfig>>,
    headers.map((header) => inferFieldType(header, sampleByField.get(header) ?? []).name)
  );

  const inserted = await appendRows(config as NonNullable<ReturnType<typeof getAirtableConfig>>, baseId, rows);

  return {
    inputPath: resolvedInputPath,
    rowCount: rows.length,
    inserted,
    baseId,
    tableName: config.tableName,
    enabled: true
  };
}
