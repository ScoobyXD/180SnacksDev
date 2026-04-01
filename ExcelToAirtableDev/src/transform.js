const OUTPUT_COLUMNS = [
  'Item',
  'Region',
  'Venue',
  'Week Ending',
  'Date',
  'Dollar Sales',
  'Unit Sales',
  'Inventory On Hand',
  'Average Price per Unit',
  'NSI Units On Hand',
  'Refund Units',
  'Average Inventory per Day',
  'Average Coupon Value',
  'Average Promoted Price'
];

const METRIC_COLUMNS = [
  'Dollar Sales',
  'Unit Sales',
  'Inventory On Hand',
  'Average Price per Unit',
  'NSI Units On Hand',
  'Refund Units',
  'Average Inventory per Day',
  'Average Coupon Value',
  'Average Promoted Price'
];

function asCleanString(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).replace(/\s+/g, ' ').trim();
}

function asMaybeNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const parsed = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function isTotalRow(venueRaw) {
  const venue = asCleanString(venueRaw).toLowerCase();
  return venue.includes('total us by region') || venue.startsWith('total ');
}

function isWarehouseRow(venueRaw) {
  return /\bwarehouse\b/i.test(asCleanString(venueRaw));
}

function isRegionRow(venueRaw) {
  const venue = asCleanString(venueRaw);
  if (!venue) {
    return false;
  }
  if (isWarehouseRow(venue) || isTotalRow(venue)) {
    return false;
  }
  return true;
}

export function transformRows(inputRows, { weekEnding = '' } = {}) {
  const output = [];
  let currentItem = '';
  let currentRegion = '';

  for (const row of inputRows) {
    const itemValue = asCleanString(row.Item);
    const venueValue = row.Venue;

    if (itemValue) {
      currentItem = itemValue;
    }

    if (isTotalRow(venueValue)) {
      continue;
    }

    if (isRegionRow(venueValue)) {
      currentRegion = asCleanString(venueValue);
      continue;
    }

    if (!isWarehouseRow(venueValue)) {
      continue;
    }

    const normalized = {
      Item: currentItem,
      Region: currentRegion,
      Venue: asCleanString(venueValue),
      'Week Ending': weekEnding,
      Date: '',
      'Dollar Sales': null,
      'Unit Sales': null,
      'Inventory On Hand': null,
      'Average Price per Unit': null,
      'NSI Units On Hand': null,
      'Refund Units': null,
      'Average Inventory per Day': null,
      'Average Coupon Value': null,
      'Average Promoted Price': null
    };

    for (const metricColumn of METRIC_COLUMNS) {
      normalized[metricColumn] = asMaybeNumber(row[metricColumn]);
    }

    output.push(normalized);
  }

  return output;
}

export function getOutputColumns() {
  return [...OUTPUT_COLUMNS];
}
