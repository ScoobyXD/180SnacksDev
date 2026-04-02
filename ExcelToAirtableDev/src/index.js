import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import ExcelJS from 'exceljs';
import { appendRowsToAirtable, ensureAirtableBaseAndTable, getAirtableConfig } from './airtable.js';
import { getOutputColumns, transformRows } from './transform.js';
import { detectWeekEndingFromShapesFile } from './weekEnding.js';

const CURRENCY_COLUMNS = new Set(['Dollar Sales', 'Average Price per Unit']);

function loadEnvFiles() {
  const envFiles = ['.env', '.env.local'];
  for (const filename of envFiles) {
    const fullPath = path.resolve(process.cwd(), filename);
    if (fs.existsSync(fullPath)) {
      process.loadEnvFile(fullPath);
    }
  }
}

function getArg(name) {
  const arg = process.argv.find((item) => item.startsWith(`--${name}=`));
  return arg ? arg.split('=').slice(1).join('=') : undefined;
}

function findLatestIRIDownload() {
  const downloadsDir = path.resolve(process.cwd(), '..', 'IRIDev', 'artifacts', 'downloads');
  if (!fs.existsSync(downloadsDir)) {
    throw new Error(`No --input provided and downloads directory does not exist: ${downloadsDir}`);
  }

  const candidates = fs.readdirSync(downloadsDir)
    .filter((name) => /\.xlsx$/i.test(name))
    .map((name) => {
      const fullPath = path.join(downloadsDir, name);
      const stats = fs.statSync(fullPath);
      return {
        fullPath,
        mtimeMs: stats.mtimeMs
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  if (!candidates.length) {
    throw new Error(`No .xlsx files found in ${downloadsDir}. Run IRIDev download mode first.`);
  }

  return candidates[0].fullPath;
}

function resolveInputPath() {
  return getArg('input') ?? findLatestIRIDownload();
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

function detectHeaderRow(rowArrays) {
  const maxScan = Math.min(rowArrays.length, 25);
  for (let i = 0; i < maxScan; i += 1) {
    const values = (rowArrays[i] || []).map((value) => String(value ?? '').toLowerCase().trim());
    if (values.includes('item') && values.includes('venue')) {
      return i;
    }
  }
  return 0;
}

async function loadInputRows(inputPath) {
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

  const headerRowIndex = detectHeaderRow(rowArrays);
  const detectedWeekEnding = await detectWeekEndingFromShapesFile(inputPath);
  const headers = (rowArrays[headerRowIndex] || []).map((value) => String(value ?? '').trim());
  const bodyRows = rowArrays.slice(headerRowIndex + 1);

  const rows = bodyRows.map((row) => {
    const record = {};
    for (let i = 0; i < headers.length; i += 1) {
      const key = headers[i] || `Column_${i + 1}`;
      record[key] = row[i] ?? null;
    }
    return record;
  });

  return { rows, detectedWeekEnding };
}

function defaultOutputPath(inputPath) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = path.basename(inputPath, path.extname(inputPath));
  return path.join('artifacts', `${stamp}-${base}-normalized.xlsx`);
}

async function saveOutputWorkbook(records, outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const outputHeaders = getOutputColumns();
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Normalized');

  worksheet.addRow(outputHeaders);
  for (const record of records) {
    worksheet.addRow(outputHeaders.map((header) => record[header] ?? null));
  }

  for (let columnIndex = 0; columnIndex < outputHeaders.length; columnIndex += 1) {
    const header = outputHeaders[columnIndex];
    if (!CURRENCY_COLUMNS.has(header)) {
      continue;
    }

    const worksheetColumn = worksheet.getColumn(columnIndex + 1);
    worksheetColumn.eachCell({ includeEmpty: false }, (cell, rowNumber) => {
      if (rowNumber === 1 || typeof cell.value !== 'number') {
        return;
      }
      cell.numFmt = '$#,##0.0000';
    });
  }

  await workbook.xlsx.writeFile(outputPath);
}

async function main() {
  loadEnvFiles();
  const inputPath = resolveInputPath();
  const outputPath = getArg('output') ?? defaultOutputPath(inputPath);

  const { rows: inputRows, detectedWeekEnding } = await loadInputRows(inputPath);
  const weekEnding = detectedWeekEnding;

  if (!weekEnding) {
    throw new Error('Could not detect a week ending date from Shape 1 metadata in the input sheet.');
  }

  const normalizedRows = transformRows(inputRows, { weekEnding });
  await saveOutputWorkbook(normalizedRows, outputPath);

  const airtableConfig = getAirtableConfig();
  let airtable = { enabled: false };

  if (airtableConfig.enabled) {
    const outputColumns = getOutputColumns();
    const ensured = await ensureAirtableBaseAndTable(airtableConfig, outputColumns);
    const appendResult = await appendRowsToAirtable(
      { ...airtableConfig, baseId: ensured.baseId },
      normalizedRows
    );

    if (appendResult.rejected > 0) {
      fs.mkdirSync('artifacts/rejects', { recursive: true });
      const rejectPath = path.join(
        'artifacts',
        'rejects',
        `${new Date().toISOString().replace(/[:.]/g, '-')}-airtable-rejects.json`
      );
      fs.writeFileSync(rejectPath, JSON.stringify(appendResult.rejects, null, 2), 'utf8');
      throw new Error(
        `Airtable accepted ${appendResult.appended} rows but rejected ${appendResult.rejected} rows. ` +
        `Reject details saved to ${rejectPath}. First reject: ${appendResult.rejects[0]?.message ?? 'unknown error'}`
      );
    }

    airtable = {
      enabled: true,
      baseId: ensured.baseId,
      tableName: airtableConfig.tableName,
      ...ensured,
      ...appendResult
    };
  }

  console.log(JSON.stringify({
    inputPath,
    outputPath,
    inputRowCount: inputRows.length,
    outputRowCount: normalizedRows.length,
    weekEnding,
    weekEndingSource: 'detected-from-sheet-shape',
    note: 'Date column intentionally left blank.',
    airtable
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
