import process from 'node:process';

const BATCH_SIZE = 10;

const FIELD_DEFINITIONS = {
  Department: { type: 'singleLineText' },
  'Billing Vendor': { type: 'singleLineText' },
  'Participating Vendor': { type: 'singleLineText' },
  'Dept. Name': { type: 'singleSelect' },
  'Item #': { type: 'singleLineText' },
  'Item Name': { type: 'singleLineText' },
  'Costco Region': { type: 'singleSelect' },
  'Execution Date': {
    type: 'date',
    options: { dateFormat: { name: 'local' } }
  },
  Warehouse: { type: 'singleLineText' },
  Status: { type: 'singleSelect' },
  'Not Purchased Reason': { type: 'singleLineText' },
  'Request #': { type: 'singleLineText' },
  'Event Type': { type: 'singleSelect' },
  'Split Vendor': { type: 'singleLineText' },
  'Invoice #': { type: 'singleLineText' },
  'Updated Date Est': {
    type: 'dateTime',
    options: {
      dateFormat: { name: 'local' },
      timeFormat: { name: '12hour' },
      timeZone: 'client'
    }
  },
  Today: {
    type: 'date',
    options: { dateFormat: { name: 'local' } }
  },
  'Event Count': { type: 'number', options: { precision: 1 } },
  'Labor Charge + Tax': { type: 'currency', options: { precision: 2, symbol: '$' } },
  'Product Charge + Tax': { type: 'currency', options: { precision: 2, symbol: '$' } },
  'CRV Charge + Tax': { type: 'currency', options: { precision: 2, symbol: '$' } },
  'Supply Charge + Tax': { type: 'currency', options: { precision: 2, symbol: '$' } },
  'Enhancement Charge + Tax': { type: 'currency', options: { precision: 2, symbol: '$' } },
  'Coupon Charge + Tax': { type: 'currency', options: { precision: 2, symbol: '$' } },
  'Total Charges': { type: 'currency', options: { precision: 2, symbol: '$' } },
  'Total Units Purchased': { type: 'number', options: { precision: 0 } },
  'Event Units': { type: 'number', options: { precision: 0 } }
};

function getEnv(name, { required = false } = {}) {
  const value = process.env[name];
  if (required && !value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function toBoolean(value) {
  return String(value ?? '').toLowerCase() === 'true';
}

function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function normalizeEmpty(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'string' && value.trim() === '') {
    return null;
  }
  return value;
}

function parseDateValue(value, { withTime = false } = {}) {
  const normalized = normalizeEmpty(value);
  if (normalized === null) {
    return null;
  }

  const date = normalized instanceof Date ? normalized : new Date(String(normalized));
  if (Number.isNaN(date.getTime())) {
    return String(normalized);
  }

  if (withTime) {
    return date.toISOString();
  }

  return date.toISOString().slice(0, 10);
}

function parseNumberValue(value, { precision = 2 } = {}) {
  const normalized = normalizeEmpty(value);
  if (normalized === null) {
    return null;
  }

  if (typeof normalized === 'number') {
    return Number(normalized.toFixed(precision));
  }

  const text = String(normalized).replace(/,/g, '').trim();
  const numeric = Number.parseFloat(text);
  if (Number.isNaN(numeric)) {
    return String(normalized);
  }

  return Number(numeric.toFixed(precision));
}

function parseCurrencyValue(value) {
  const normalized = normalizeEmpty(value);
  if (normalized === null) {
    return null;
  }

  if (typeof normalized === 'number') {
    return Number(normalized.toFixed(2));
  }

  const cleaned = String(normalized).replace(/[$,]/g, '').trim();
  const numeric = Number.parseFloat(cleaned);
  if (Number.isNaN(numeric)) {
    return String(normalized);
  }

  return Number(numeric.toFixed(2));
}

function coerceValueForField(fieldName, value) {
  const definition = FIELD_DEFINITIONS[fieldName];
  if (!definition) {
    return normalizeEmpty(value);
  }

  if (definition.type === 'singleLineText' || definition.type === 'singleSelect') {
    const normalized = normalizeEmpty(value);
    return normalized === null ? null : String(normalized);
  }

  if (definition.type === 'date') {
    return parseDateValue(value, { withTime: false });
  }

  if (definition.type === 'dateTime') {
    return parseDateValue(value, { withTime: true });
  }

  if (definition.type === 'currency') {
    return parseCurrencyValue(value);
  }

  if (definition.type === 'number') {
    return parseNumberValue(value, {
      precision: definition.options?.precision ?? 2
    });
  }

  return normalizeEmpty(value);
}

async function airtableRequest(url, { method = 'GET', body, token }) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable API request failed (${response.status} ${response.statusText}): ${text}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

function inferField(name, sampleValues = []) {
  const definition = FIELD_DEFINITIONS[name];
  if (definition) {
    return { name, type: definition.type, options: definition.options };
  }

  const compact = sampleValues.filter((value) => value !== null && value !== undefined && String(value).trim() !== '');

  if (!compact.length) {
    return { name, type: 'singleLineText' };
  }

  if (compact.every((value) => typeof value === 'number')) {
    return { name, type: 'number', options: { precision: 4 } };
  }

  if (compact.every((value) => typeof value === 'boolean')) {
    return { name, type: 'checkbox', options: { icon: 'check', color: 'greenBright' } };
  }

  return { name, type: 'singleLineText' };
}

function withSingleSelectChoices(field, rows) {
  if (field.type !== 'singleSelect') {
    return field;
  }

  const choices = Array.from(
    new Set(
      rows
        .map((row) => row[field.name])
        .map((value) => (value === null || value === undefined ? '' : String(value).trim()))
        .filter((value) => value.length > 0)
    )
  )
    .slice(0, 500)
    .map((name) => ({ name }));

  return {
    ...field,
    options: {
      choices
    }
  };
}

async function listWorkspaceBases(config) {
  const workspaceUrl = `https://api.airtable.com/v0/meta/workspaces/${config.workspaceId}/bases`;
  const payload = await airtableRequest(workspaceUrl, { token: config.token });
  return payload.bases ?? [];
}

async function createBase(config, fields) {
  const workspaceUrl = `https://api.airtable.com/v0/meta/workspaces/${config.workspaceId}/bases`;
  const payload = await airtableRequest(workspaceUrl, {
    method: 'POST',
    token: config.token,
    body: {
      name: config.baseName,
      tables: [
        {
          name: config.tableName,
          fields
        }
      ]
    }
  });

  return {
    baseId: payload.id,
    createdBase: true,
    createdTable: true,
    tableId: payload.tables?.[0]?.id ?? null,
    addedFields: []
  };
}

export function getAirtableConfig() {
  const enabled = toBoolean(process.env.AIRTABLE_SYNC_ENABLED);
  if (!enabled) {
    return { enabled: false };
  }

  const baseId = process.env.AIRTABLE_BASE_ID;
  const workspaceId = process.env.AIRTABLE_WORKSPACE_ID;
  const baseName = process.env.AIRTABLE_BASE_NAME;

  if (!baseId && (!workspaceId || !baseName)) {
    throw new Error('Set AIRTABLE_BASE_ID, or provide AIRTABLE_WORKSPACE_ID + AIRTABLE_BASE_NAME.');
  }

  return {
    enabled: true,
    token: getEnv('AIRTABLE_TOKEN', { required: true }),
    baseId,
    workspaceId,
    baseName,
    tableName: getEnv('AIRTABLE_TABLE_NAME', { required: true }),
    createBaseIfMissing: toBoolean(process.env.AIRTABLE_CREATE_BASE_IF_MISSING),
    createTableIfMissing: toBoolean(process.env.AIRTABLE_CREATE_TABLE_IF_MISSING),
    addMissingFields: toBoolean(process.env.AIRTABLE_ADD_MISSING_FIELDS ?? 'true')
  };
}

export async function ensureAirtableBaseAndTable(config, fields) {
  if (config.baseId) {
    const tableInfo = await ensureAirtableTable({ ...config, baseId: config.baseId }, fields);
    return { baseId: config.baseId, createdBase: false, ...tableInfo };
  }

  const existingBases = await listWorkspaceBases(config);
  const existingBase = existingBases.find((base) => base.name === config.baseName);

  if (existingBase) {
    const tableInfo = await ensureAirtableTable({ ...config, baseId: existingBase.id }, fields);
    return { baseId: existingBase.id, createdBase: false, ...tableInfo };
  }

  if (!config.createBaseIfMissing) {
    throw new Error(`Base "${config.baseName}" not found in workspace ${config.workspaceId}.`);
  }

  return createBase(config, fields);
}

async function addMissingFields(config, tableId, fieldObjectsByName, existingFieldNames) {
  if (!config.addMissingFields) {
    return [];
  }

  const missing = Object.keys(fieldObjectsByName).filter((name) => !existingFieldNames.has(name));
  const added = [];

  for (const fieldName of missing) {
    const createFieldUrl = `https://api.airtable.com/v0/meta/bases/${config.baseId}/tables/${tableId}/fields`;
    await airtableRequest(createFieldUrl, {
      method: 'POST',
      token: config.token,
      body: fieldObjectsByName[fieldName]
    });
    added.push(fieldName);
  }

  return added;
}

export async function ensureAirtableTable(config, fields) {
  const baseUrl = `https://api.airtable.com/v0/meta/bases/${config.baseId}/tables`;
  const meta = await airtableRequest(baseUrl, { token: config.token });

  const existing = meta.tables?.find((table) => table.name === config.tableName);
  if (existing) {
    const existingFieldNames = new Set((existing.fields ?? []).map((field) => field.name));
    const fieldObjectsByName = Object.fromEntries(fields.map((field) => [field.name, field]));
    const addedFields = await addMissingFields(config, existing.id, fieldObjectsByName, existingFieldNames);

    return { createdTable: false, tableId: existing.id, addedFields };
  }

  if (!config.createTableIfMissing) {
    throw new Error(`Table "${config.tableName}" not found in base ${config.baseId}.`);
  }

  const created = await airtableRequest(baseUrl, {
    method: 'POST',
    token: config.token,
    body: {
      name: config.tableName,
      fields
    }
  });

  return { createdTable: true, tableId: created.id, addedFields: [] };
}

async function appendBatch(config, rows) {
  const url = `https://api.airtable.com/v0/${config.baseId}/${encodeURIComponent(config.tableName)}`;
  return airtableRequest(url, {
    method: 'POST',
    token: config.token,
    body: {
      records: rows.map((row) => ({ fields: row })),
      typecast: true
    }
  });
}

export async function appendRowsToAirtable(config, rows) {
  if (!rows.length) {
    return {
      inserted: 0,
      batches: 0
    };
  }

  const batches = chunk(rows, BATCH_SIZE);
  let inserted = 0;

  for (let i = 0; i < batches.length; i += 1) {
    const payload = await appendBatch(config, batches[i]);
    inserted += payload.records?.length ?? 0;
  }

  return {
    inserted,
    batches: batches.length
  };
}

export function buildAirtableFields(headers, rows) {
  const sampleByHeader = new Map(headers.map((header) => [header, []]));

  for (const row of rows.slice(0, 100)) {
    for (const header of headers) {
      sampleByHeader.get(header).push(row[header]);
    }
  }

  return headers.map((header) => {
    const inferred = inferField(header, sampleByHeader.get(header));
    return withSingleSelectChoices(inferred, rows);
  });
}

export function normalizeRowsForAirtable(rows, headers) {
  return rows.map((row) => {
    const out = {};
    for (const header of headers) {
      out[header] = coerceValueForField(header, row[header]);
    }
    return out;
  });
}
