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
    .filter((name) => /\.(xlsx|csv)$/i.test(name))
    .map((name) => {
      const fullPath = path.join(downloadsDir, name);
      const stats = fs.statSync(fullPath);
      return { fullPath, mtimeMs: stats.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  if (!candidates.length) {
    const available = fs.readdirSync(downloadsDir);
    const hint = available.length ? ` Found files: ${available.join(', ')}` : ' Directory is empty.';
    throw new Error(`No .xlsx or .csv files found in ${downloadsDir}.${hint}`);
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
  const ext = path.extname(inputPath).toLowerCase();

  if (ext === '.csv') {
    // Detect encoding: UTF-16 LE starts with BOM FF FE, UTF-16 BE with FE FF
    const rawBuf = fs.readFileSync(inputPath);
    let csvText;
    if (rawBuf[0] === 0xFF && rawBuf[1] === 0xFE) {
      csvText = rawBuf.toString('utf16le');
    } else if (rawBuf[0] === 0xFE && rawBuf[1] === 0xFF) {
      for (let i = 0; i < rawBuf.length - 1; i += 2) {
        const tmp = rawBuf[i]; rawBuf[i] = rawBuf[i + 1]; rawBuf[i + 1] = tmp;
      }
      csvText = rawBuf.toString('utf16le');
    } else {
      csvText = rawBuf.toString('utf8');
    }
    // Strip BOM
    if (csvText.charCodeAt(0) === 0xFEFF) csvText = csvText.slice(1);

    // Detect delimiter
    const firstLine = csvText.split(/\r?\n/)[0] || '';
    const delimiter = firstLine.includes('\t') ? '\t' : ',';

    const tmpPath = path.join(process.cwd(), `_tmp_utf8_${Date.now()}.csv`);
    fs.writeFileSync(tmpPath, csvText, 'utf8');
    try {
      await workbook.csv.readFile(tmpPath, { parserOptions: { delimiter } });
    } finally {
      try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    }
  } else {
    await workbook.xlsx.readFile(inputPath);
  }

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

  const rawHeaders = rowArrays[headerRowIndex].map((value, index) => {
    // Strip invisible/non-printable Unicode chars (BOM, combining grapheme joiner, zero-width chars)
    // then trim whitespace
    const label = String(value ?? '')
      .replace(/[\u034F\uFEFF\u200B-\u200D\u00AD\r\n]/g, '')
      .trim();
    return label || `Column_${index + 1}`;
  });

  // The first column (A1) is always blank in this export — it's the Department column
  const headers = rawHeaders.map((h, i) => {
    if (i === 0 && h.startsWith('Column_')) return 'Department';
    return h;
  });

  // Filter out summary/total rows
  const SUMMARY_MARKERS = /^(grand\s+)?total$/i;

  const rows = rowArrays
    .slice(headerRowIndex + 1)
    .filter((row) => !isEmptyRow(row))
    .filter((row) => !row.some((cell) => typeof cell === 'string' && SUMMARY_MARKERS.test(cell.trim())))
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

  // --- Debug: show what we're about to send ---
  console.log('--- DEBUG: Parsed headers ---');
  console.log(JSON.stringify(headers, null, 2));
  console.log(`--- DEBUG: ${normalizedRows.length} data rows (summary rows excluded) ---`);
  if (normalizedRows.length > 0) {
    console.log('--- DEBUG: First record to be sent ---');
    console.log(JSON.stringify(normalizedRows[0], null, 2));
  }
  // --- End debug ---

  const fields = buildAirtableFields(headers, normalizedRows);
  const ensured = await ensureAirtableBaseAndTable(airtableConfig, fields);
  const appended = await appendRowsToAirtable({ ...airtableConfig, baseId: ensured.baseId, tableId: ensured.tableId }, normalizedRows);

  console.log(JSON.stringify({
    enabled: true,
    inputPath,
    sheetName,
    rowCount: rows.length,
    baseId: ensured.baseId,
    tableName: airtableConfig.tableName,
    tableId: ensured.tableId || airtableConfig.tableId || null,
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
