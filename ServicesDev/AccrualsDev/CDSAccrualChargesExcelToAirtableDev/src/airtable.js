import process from 'node:process';

const BATCH_SIZE = 10;

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
    tableId: payload.tables?.[0]?.id ?? null
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
    createTableIfMissing: toBoolean(process.env.AIRTABLE_CREATE_TABLE_IF_MISSING)
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

export async function ensureAirtableTable(config, fields) {
  const baseUrl = `https://api.airtable.com/v0/meta/bases/${config.baseId}/tables`;
  const meta = await airtableRequest(baseUrl, { token: config.token });

  const existing = meta.tables?.find((table) => table.name === config.tableName);
  if (existing) {
    return { createdTable: false, tableId: existing.id };
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

  return { createdTable: true, tableId: created.id };
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

  return headers.map((header) => inferField(header, sampleByHeader.get(header)));
}
