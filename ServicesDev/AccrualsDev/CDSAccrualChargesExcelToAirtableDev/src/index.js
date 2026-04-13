import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import ExcelJS from 'exceljs';
import {
  appendRowsToAirtable,
  buildAirtableFields,
  ensureAirtableBaseAndTable,
  getAirtableConfig,
  normalizeRowsForAirtable
} from './airtable.js';

function loadEnvFiles() {
  const repoRoot = path.resolve(process.cwd(), '..', '..', '..');
  const envFiles = [
    path.resolve(process.cwd(), '.envsoft'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '.env.local'),
    path.join(repoRoot, '180SnacksRTSDev', '.envsoft')
  ];

  for (const fullPath of envFiles) {
    if (fs.existsSync(fullPath)) {
      process.loadEnvFile(fullPath);
    }
  }
}

function getArg(name) {
  const arg = process.argv.find((item) => item.startsWith(`--${name}=`));
  return arg ? arg.split('=').slice(1).join('=') : undefined;
}

function resolveExtractDirName() {
  if (process.env.CDS_EXTRACT_DIR) {
    return process.env.CDS_EXTRACT_DIR;
  }

  const accrualsRoot = path.resolve(process.cwd(), '..');
  const dirs = fs.readdirSync(accrualsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => /^CDSAccrualChargesExtract/i.test(name));

  if (!dirs.length) {
    throw new Error(
      `Could not auto-detect CDS extract project folder under ${accrualsRoot}. Set CDS_EXTRACT_DIR explicitly.`
    );
  }

  return dirs[0];
}

function findLatestCDSDownload() {
  const extractDirName = resolveExtractDirName();
  const downloadsDir = path.resolve(process.cwd(), '..', extractDirName, 'artifacts', 'downloads');

  if (!fs.existsSync(downloadsDir)) {
    throw new Error(`No downloads directory found: ${downloadsDir}`);
  }

  const candidates = fs.readdirSync(downloadsDir)
    .filter((name) => /\.xlsx$/i.test(name))
    .map((name) => {
      const fullPath = path.join(downloadsDir, name);
      const stats = fs.statSync(fullPath);
      return { fullPath, mtimeMs: stats.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  if (!candidates.length) {
    throw new Error(`No .xlsx files found in ${downloadsDir}`);
  }

  return candidates[0].fullPath;
}

function resolveInputPath() {
  return getArg('input') ?? findLatestCDSDownload();
}

function toPrimitiveCellValue(value) {
  if (value === undefined || value === null) {
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
      return value.result;
    }
    if ('text' in value && typeof value.text === 'string') {
      return value.text;
    }
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text ?? '').join('');
    }
    if ('hyperlink' in value && typeof value.hyperlink === 'string') {
      return value.text ?? value.hyperlink;
    }
  }

  return String(value);
}

function isEmptyRow(values) {
  return values.every((value) => value === null || value === undefined || String(value).trim() === '');
}

async function loadWorkbookRows(inputPath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(inputPath);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('Workbook has no worksheets.');
  }

  const rowArrays = [];
  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const values = [];
    for (let col = 1; col <= worksheet.columnCount; col += 1) {
      values.push(toPrimitiveCellValue(row.getCell(col).value));
    }
    rowArrays.push(values);
  }

  const headerRowIndex = rowArrays.findIndex((row) => !isEmptyRow(row));
  if (headerRowIndex < 0) {
    throw new Error('Workbook is empty.');
  }

  const headers = rowArrays[headerRowIndex].map((value, index) => {
    const label = String(value ?? '').trim();
    return label || `Column_${index + 1}`;
  });

  const rows = rowArrays
    .slice(headerRowIndex + 1)
    .filter((row) => !isEmptyRow(row))
    .map((values) => {
      const record = {};
      for (let i = 0; i < headers.length; i += 1) {
        record[headers[i]] = values[i] ?? null;
      }
      return record;
    });

  return {
    sheetName: worksheet.name,
    headers,
    rows
  };
}

async function main() {
  loadEnvFiles();
  const inputPath = resolveInputPath();

  const { sheetName, headers, rows } = await loadWorkbookRows(inputPath);

  const airtableConfig = getAirtableConfig();
  if (!airtableConfig.enabled) {
    console.log(JSON.stringify({
      enabled: false,
      inputPath,
      sheetName,
      rowCount: rows.length,
      note: 'Set AIRTABLE_SYNC_ENABLED=true to enable sync.'
    }, null, 2));
    return;
  }

  const normalizedRows = normalizeRowsForAirtable(rows, headers);
  const fields = buildAirtableFields(headers, normalizedRows);
  const ensured = await ensureAirtableBaseAndTable(airtableConfig, fields);
  const appended = await appendRowsToAirtable({ ...airtableConfig, baseId: ensured.baseId }, normalizedRows);

  console.log(JSON.stringify({
    enabled: true,
    inputPath,
    sheetName,
    rowCount: rows.length,
    baseId: ensured.baseId,
    tableName: airtableConfig.tableName,
    createdBase: ensured.createdBase,
    createdTable: ensured.createdTable,
    inserted: appended.inserted,
    batches: appended.batches,
    addedFields: ensured.addedFields
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
