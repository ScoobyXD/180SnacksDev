import process from 'node:process';

const BATCH_SIZE = 10;

class AirtableApiError extends Error {
  constructor(message, { status, statusText, errorType } = {}) {
    super(message);
    this.name = 'AirtableApiError';
    this.status = status;
    this.statusText = statusText;
    this.errorType = errorType;
  }
}

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

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function withPermissionHint(message, parsedError) {
  const type = parsedError?.error?.type;
  if (type !== 'INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND') {
    return message;
  }

  return `${message}\nHint: this usually means the PAT is not scoped to this base/table, or the base/table id/name is wrong.`;
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

  const text = await response.text();
  if (!response.ok) {
    const parsedError = tryParseJson(text);
    const errorType = parsedError?.error?.type;
    const message = withPermissionHint(
      `Airtable API request failed (${response.status} ${response.statusText}): ${text}`,
      parsedError
    );

    throw new AirtableApiError(message, {
      status: response.status,
      statusText: response.statusText,
      errorType
    });
  }

  return text ? JSON.parse(text) : {};
}

function isModelNotFoundError(error) {
  return error instanceof AirtableApiError && (
    error.status === 404 ||
    error.errorType === 'MODEL_NOT_FOUND' ||
    error.errorType === 'INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND'
  );
}

function inferField(name) {
  if (name === 'Date' || name.includes('Week Ending')) {
    return { name, type: 'singleLineText' };
  }

  if (name.includes('Sales') || name.includes('Units') || name.includes('Price') || name.includes('Inventory')) {
    return { name, type: 'number', options: { precision: 4 } };
  }

  return { name, type: 'singleLineText' };
}

async function listWorkspaceBases(config) {
  const workspaceUrl = `https://api.airtable.com/v0/meta/workspaces/${config.workspaceId}/bases`;
  const payload = await airtableRequest(workspaceUrl, { token: config.token });
  return payload.bases ?? [];
}

async function createBase(config, fieldNames) {
  const workspaceUrl = `https://api.airtable.com/v0/meta/workspaces/${config.workspaceId}/bases`;
  const payload = await airtableRequest(workspaceUrl, {
    method: 'POST',
    token: config.token,
    body: {
      name: config.baseName,
      tables: [
        {
          name: config.tableName,
          fields: fieldNames.map(inferField)
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
    throw new Error(
      'Set AIRTABLE_BASE_ID, or provide AIRTABLE_WORKSPACE_ID + AIRTABLE_BASE_NAME so the script can find/create the base.'
    );
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

async function resolveBase(config, fieldNames) {
  if (config.baseId) {
    return { baseId: config.baseId, createdBase: false };
  }

  const existingBases = await listWorkspaceBases(config);
  const existingBase = existingBases.find((base) => base.name === config.baseName);
  if (existingBase) {
    return { baseId: existingBase.id, createdBase: false };
  }

  if (!config.createBaseIfMissing) {
    throw new Error(
      `Airtable base "${config.baseName}" not found in workspace ${config.workspaceId}. Set AIRTABLE_CREATE_BASE_IF_MISSING=true to create it automatically.`
    );
  }

  return createBase(config, fieldNames);
}

export async function ensureAirtableTable(config, fieldNames) {
  const baseUrl = `https://api.airtable.com/v0/meta/bases/${config.baseId}/tables`;
  const meta = await airtableRequest(baseUrl, { token: config.token });

  const existing = meta.tables?.find((table) => table.name === config.tableName);
  if (existing) {
    return { createdTable: false, tableId: existing.id };
  }

  if (!config.createTableIfMissing) {
    throw new Error(
      `Airtable table "${config.tableName}" not found in base ${config.baseId}. Set AIRTABLE_CREATE_TABLE_IF_MISSING=true to allow automatic creation.`
    );
  }

  const created = await airtableRequest(baseUrl, {
    method: 'POST',
    token: config.token,
    body: {
      name: config.tableName,
      fields: fieldNames.map(inferField)
    }
  });

  return { createdTable: true, tableId: created.id };
}

export async function appendRowsToAirtable(config, rows) {
  if (!rows.length) {
    return { appended: 0, batches: 0 };
  }

  const url = `https://api.airtable.com/v0/${config.baseId}/${encodeURIComponent(config.tableName)}`;
  const batches = chunk(rows, BATCH_SIZE);
  let appended = 0;

  for (const batch of batches) {
    const records = batch.map((row) => ({ fields: row }));
    const result = await airtableRequest(url, {
      method: 'POST',
      token: config.token,
      body: {
        records,
        typecast: true
      }
    });

    appended += result.records?.length ?? records.length;
  }

  return {
    appended,
    batches: batches.length
  };
}

export async function syncRowsToAirtable(config, fieldNames, rows) {
  const baseInfo = await resolveBase(config, fieldNames);
  const target = { ...config, baseId: baseInfo.baseId };

  try {
    const appendInfo = await appendRowsToAirtable(target, rows);
    return {
      baseId: baseInfo.baseId,
      createdBase: baseInfo.createdBase ?? false,
      createdTable: baseInfo.createdTable ?? false,
      ...appendInfo
    };
  } catch (error) {
    if (!config.createTableIfMissing || !isModelNotFoundError(error)) {
      throw error;
    }

    const tableInfo = await ensureAirtableTable(target, fieldNames);
    const appendInfo = await appendRowsToAirtable(target, rows);

    return {
      baseId: baseInfo.baseId,
      createdBase: baseInfo.createdBase ?? false,
      createdTable: tableInfo.createdTable,
      ...appendInfo
    };
  }
}
