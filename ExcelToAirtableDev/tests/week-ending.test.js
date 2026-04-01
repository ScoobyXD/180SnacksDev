import test from 'node:test';
import assert from 'node:assert/strict';
import { extractWeekEndingFromText, normalizeWeekEnding } from '../src/weekEnding.js';

test('normalizeWeekEnding converts MM-DD-YYYY and MM/DD/YYYY to MM-DD-YYYY', () => {
  assert.equal(normalizeWeekEnding('03-29-2026'), '03-29-2026');
  assert.equal(normalizeWeekEnding('3/9/26'), '03-09-2026');
});

test('extractWeekEndingFromText parses week ending phrase', () => {
  assert.equal(
    extractWeekEndingFromText('Item: 180 SNACKS Time :1 week ending 03-29-2026'),
    '03-29-2026'
  );
});
