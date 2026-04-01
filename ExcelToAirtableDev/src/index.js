import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import * as XLSX from 'xlsx';
import { getOutputColumns, transformRows } from './transform.js';

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

function loadInputRows(inputPath) {
  const workbook = XLSX.readFile(inputPath, { cellDates: false });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const rowsAsArrays = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false
  });

  const headerRowIndex = detectHeaderRow(rowsAsArrays);
  const headers = (rowsAsArrays[headerRowIndex] || []).map((value) => String(value ?? '').trim());
  const bodyRows = rowsAsArrays.slice(headerRowIndex + 1);

  return bodyRows.map((row) => {
    const record = {};
    for (let i = 0; i < headers.length; i += 1) {
      const key = headers[i] || `Column_${i + 1}`;
      record[key] = row[i] ?? null;
    }
    return record;
  });
}

function defaultOutputPath(inputPath) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = path.basename(inputPath, path.extname(inputPath));
  return path.join('artifacts', `${stamp}-${base}-normalized.xlsx`);
}

function saveOutputWorkbook(records, outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const worksheet = XLSX.utils.json_to_sheet(records, {
    header: getOutputColumns(),
    skipHeader: false
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Normalized');
  XLSX.writeFile(workbook, outputPath);
}

function main() {
  const inputPath = requireInputPath();
  const outputPath = getArg('output') ?? defaultOutputPath(inputPath);
  const weekEnding = getArg('weekEnding') ?? '';

  const inputRows = loadInputRows(inputPath);
  const normalizedRows = transformRows(inputRows, { weekEnding });
  saveOutputWorkbook(normalizedRows, outputPath);

  console.log(JSON.stringify({
    inputPath,
    outputPath,
    inputRowCount: inputRows.length,
    outputRowCount: normalizedRows.length,
    weekEnding,
    note: 'Date column intentionally left blank.'
  }, null, 2));
}

main();
