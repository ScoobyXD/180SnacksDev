import fs from 'node:fs/promises';

export function normalizeWeekEnding(rawDate) {
  const cleaned = String(rawDate ?? '').trim();
  const match = cleaned.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (!match) {
    return '';
  }

  const mm = match[1].padStart(2, '0');
  const dd = match[2].padStart(2, '0');
  const yyyy = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${mm}-${dd}-${yyyy}`;
}

export function extractWeekEndingFromText(text) {
  const weekEndingRegex = /week\s*ending[^0-9]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i;
  const match = String(text ?? '').match(weekEndingRegex);
  if (!match) {
    return '';
  }
  return normalizeWeekEnding(match[1]);
}

function decodeXmlEntities(input) {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function collectShapeText(xml) {
  const texts = [];
  const tagRegex = /<a:t[^>]*>([\s\S]*?)<\/a:t>|<v:txbxContent[\s\S]*?<w:t[^>]*>([\s\S]*?)<\/w:t>/gi;

  for (const match of xml.matchAll(tagRegex)) {
    const raw = match[1] ?? match[2] ?? '';
    const cleaned = decodeXmlEntities(raw).trim();
    if (cleaned) {
      texts.push(cleaned);
    }
  }

  return texts.join(' ');
}

export async function detectWeekEndingFromShapesFile(inputPath) {
  const fileBuffer = await fs.readFile(inputPath);
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(fileBuffer);

  const shapeFileNames = Object.keys(zip.files).filter((name) =>
    name.startsWith('xl/drawings/') || name.startsWith('xl/controls/')
  );

  for (const name of shapeFileNames) {
    if (!name.endsWith('.xml') && !name.endsWith('.vml')) {
      continue;
    }

    const xml = await zip.files[name].async('string');
    const textBlob = collectShapeText(xml);
    const detected = extractWeekEndingFromText(textBlob);
    if (detected) {
      return detected;
    }
  }

  return '';
}
