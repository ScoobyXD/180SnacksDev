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

export function getAirtableConfig() {
  const enabled = toBoolean(process.env.AIRTABLE_SYNC_ENABLED);
  if (!enabled) {
    return { enabled: false };
  }

  return {
    enabled: true,
    token: getEnv('AIRTABLE_TOKEN', { required: true }),
    baseId: getEnv('AIRTABLE_BASE_ID', { required: true }),
    tableName: getEnv('AIRTABLE_TABLE_NAME', { required: true }),
    createTableIfMissing: toBoolean(process.env.AIRTABLE_CREATE_TABLE_IF_MISSING)
  };
}

export async function ensureAirtableTable(config, fieldNames) {
  const baseUrl = `https://api.airtable.com/v0/meta/bases/${config.baseId}/tables`;
  const meta = await airtableRequest(baseUrl, { token: config.token });

  const existing = meta.tables?.find((table) => table.name === config.tableName);
  if (existing) {
    return { created: false, tableId: existing.id };
  }

  if (!config.createTableIfMissing) {
    throw new Error(
      `Airtable table \"${config.tableName}\" not found. Set AIRTABLE_CREATE_TABLE_IF_MISSING=true to allow automatic creation.`
    );
  }

  const fields = fieldNames.map((name) => {
    if (name === 'Date') {
      return { name, type: 'multilineText' };
    }
    if (name.includes('Sales') || name.includes('Units') || name.includes('Price') || name.includes('Inventory')) {
      return { name, type: 'number', options: { precision: 4 } };
    }
    return { name, type: 'singleLineText' };
  });

  fields.push({ name: 'Record Key', type: 'singleLineText' });

  const created = await airtableRequest(baseUrl, {
    method: 'POST',
    token: config.token,
    body: {
      name: config.tableName,
      fields
    }
  });

  return { created: true, tableId: created.id };
}

function createRecordKey(row) {
  return [row.Item, row.Region, row.Venue, row['Week Ending Date']].map((value) => String(value ?? '')).join('|');
}

export async function syncRowsToAirtable(config, rows) {
  if (!rows.length) {
    return { synced: 0, createdRecords: 0, updatedRecords: 0, batches: 0 };
  }

  const url = `https://api.airtable.com/v0/${config.baseId}/${encodeURIComponent(config.tableName)}`;
  const batches = chunk(rows, BATCH_SIZE);
  let synced = 0;
  let createdRecords = 0;
  let updatedRecords = 0;

  for (const batch of batches) {
    const records = batch.map((row) => ({
      fields: {
        ...row,
        'Record Key': createRecordKey(row)
      }
    }));

    const result = await airtableRequest(url, {
      method: 'PATCH',
      token: config.token,
      body: {
        performUpsert: {
          fieldsToMergeOn: ['Record Key']
        },
        records,
        typecast: true
      }
    });

    synced += records.length;
    createdRecords += result.createdRecords?.length ?? 0;
    updatedRecords += result.updatedRecords?.length ?? 0;
  }

  return {
    synced,
    createdRecords,
    updatedRecords,
    batches: batches.length
  };
}
