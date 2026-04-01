import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import ExcelJS from 'exceljs';
import { getOutputColumns, transformRows } from './transform.js';
import { detectWeekEndingFromShapesFile } from './weekEnding.js';

function getArg(name) {
  const arg = process.argv.find((item) => item.startsWith(`--${name}=`));
  return arg ? arg.split('=').slice(1).join('=') : undefined;
}

function requireInputPath() {
  const inputPath = getArg('input');
  if (!inputPath) {
    throw new Error('Missing --input=<path-to-input.xlsx>');
  }
  return inputPath;
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

  await workbook.xlsx.writeFile(outputPath);
}

async function main() {
  const inputPath = requireInputPath();
  const outputPath = getArg('output') ?? defaultOutputPath(inputPath);

  const { rows: inputRows, detectedWeekEnding } = await loadInputRows(inputPath);
  const weekEnding = detectedWeekEnding;

  if (!weekEnding) {
    throw new Error('Could not detect a week ending date from Shape 1 metadata in the input sheet.');
  }

  const normalizedRows = transformRows(inputRows, { weekEnding });
  await saveOutputWorkbook(normalizedRows, outputPath);

  console.log(JSON.stringify({
    inputPath,
    outputPath,
    inputRowCount: inputRows.length,
    outputRowCount: normalizedRows.length,
    weekEnding,
    weekEndingSource: 'detected-from-sheet-shape',
    note: 'Date column intentionally left blank.'
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
