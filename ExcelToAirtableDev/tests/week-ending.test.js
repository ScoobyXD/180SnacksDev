import test from 'node:test';
import assert from 'node:assert/strict';
import { detectWeekEnding, normalizeWeekEnding } from '../src/weekEnding.js';

test('normalizeWeekEnding converts MM-DD-YYYY and MM/DD/YYYY to YYYY-MM-DD', () => {
  assert.equal(normalizeWeekEnding('03-29-2026'), '2026-03-29');
  assert.equal(normalizeWeekEnding('3/9/26'), '2026-03-09');
});

test('detectWeekEnding finds week ending text in top metadata rows', () => {
  const rows = [
    ['(BP226) US Costco Small Vendor Report_PREMIUM'],
    ['Item: 180 SNACKS Time :1 week ending 03-29-2026'],
    [],
    ['Item', 'Venue', 'Dollar Sales']
  ];

  assert.equal(detectWeekEnding(rows, 3), '2026-03-29');
});
