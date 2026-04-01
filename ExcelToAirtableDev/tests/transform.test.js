import test from 'node:test';
import assert from 'node:assert/strict';
import { transformRows } from '../src/transform.js';

test('keeps warehouse rows only, carries item+region, and leaves Date blank', () => {
  const input = [
    { Item: 'ITEM A', Venue: 'Total US by Region', 'Dollar Sales': 100 },
    { Item: null, Venue: '  Northeast' },
    { Item: null, Venue: '      WAREHOUSE 1000 COLUMBIA MD', 'Dollar Sales': 11, 'Unit Sales': 2 },
    { Item: null, Venue: '      WAREHOUSE 1001 BALTIMORE', 'Dollar Sales': 22, 'Unit Sales': 4 },
    { Item: 'ITEM B', Venue: 'Total US by Region', 'Dollar Sales': 200 },
    { Item: null, Venue: '  Texas' },
    { Item: null, Venue: '      WAREHOUSE 1697 RICHMOND TX', 'Dollar Sales': -25.78, 'Refund Units': -2 }
  ];

  const out = transformRows(input, { weekEnding: '2026-03-29' });

  assert.equal(out.length, 3);
  assert.deepEqual(out.map((r) => r.Item), ['ITEM A', 'ITEM A', 'ITEM B']);
  assert.deepEqual(out.map((r) => r.Region), ['Northeast', 'Northeast', 'Texas']);
  assert.equal(out[0].Date, '');
  assert.equal(out[2]['Dollar Sales'], -25.78);
  assert.equal(out[2]['Refund Units'], -2);
});


test('ignores rows until first warehouse and handles numeric strings', () => {
  const input = [
    { Item: 'ITEM C', Venue: 'Total US by Region' },
    { Item: null, Venue: '  Midwest' },
    { Item: null, Venue: '      WAREHOUSE 632 COLUMBUS', 'Unit Sales': '4,416', 'Average Price per Unit': '11.47' }
  ];

  const out = transformRows(input, { weekEnding: '' });

  assert.equal(out.length, 1);
  assert.equal(out[0]['Week Ending'], '');
  assert.equal(out[0]['Unit Sales'], 4416);
  assert.equal(out[0]['Average Price per Unit'], 11.47);
});
