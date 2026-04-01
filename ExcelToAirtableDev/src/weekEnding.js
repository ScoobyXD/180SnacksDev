export function normalizeWeekEnding(rawDate) {
  const cleaned = String(rawDate ?? '').trim();
  const match = cleaned.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (!match) {
    return '';
  }

  const mm = match[1].padStart(2, '0');
  const dd = match[2].padStart(2, '0');
  const yyyy = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${yyyy}-${mm}-${dd}`;
}

export function detectWeekEnding(rowArrays, headerRowIndex) {
  const weekEndingRegex = /week\s*ending[^0-9]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i;
  const rowsToScan = rowArrays.slice(0, Math.max(headerRowIndex + 1, 30));

  for (const row of rowsToScan) {
    for (const cell of row || []) {
      const value = String(cell ?? '');
      const match = value.match(weekEndingRegex);
      if (match) {
        return normalizeWeekEnding(match[1]);
      }
    }
  }

  return '';
}
