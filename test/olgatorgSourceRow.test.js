import test from 'node:test';
import assert from 'node:assert/strict';

process.env.OLGATORG_NEON_URL = 'postgresql://localhost/olga';
process.env.LASKA_NEON_URL = 'postgresql://localhost/laska';
const { parseOlgatorgSourceRow } = await import('../src/services/olgatorgSalesImportService.js');

function parse(quantity, amount, pricesMap = new Map()) {
  const values = [7, '16.07.2026', 'TM', 'Product', 'barcode', null, 1, quantity, amount];
  return parseOlgatorgSourceRow({ values, fileName: 'sales.xls', rowNumber: 1234, pricesMap });
}

for (const quantity of [undefined, null, '', '  ', '\u00a0']) {
  test(`empty optional quantity becomes NULL: ${JSON.stringify(quantity)}`, () => {
    const sale = parse(quantity, 120);
    assert.equal(sale[7], null);
    assert.equal(sale[8], 120);
    assert.equal(sale[18], 0);
  });
}

test('a missing quantity remains distinct from a numeric zero', () => {
  assert.equal(parse(null, 120)[7], null);
  assert.equal(parse(0, 120)[7], 0);
  assert.equal(parse('0', 120)[7], 0);
});

test('valid quantities and existing price calculation are preserved', () => {
  assert.equal(parse('2,5', 120)[7], 2.5);
  assert.equal(parse('2,5', 120)[18], 48);
  assert.equal(parse(-2, 120)[7], -2);
  assert.equal(parse(-2, 120)[18], 0);
});

for (const quantity of ['unknown', true, Infinity, '2 units']) {
  test(`nonempty invalid quantity still fails: ${String(quantity)}`, () => {
    assert.throws(() => parse(quantity, 120), /sales.xls, рядок 1234: Кво/);
  });
}

test('both quantity and amount may be absent without dropping the row', () => {
  const sale = parse(null, null);
  assert.equal(sale[3], 'Product');
  assert.equal(sale[7], null);
  assert.equal(sale[8], null);
  assert.equal(sale[18], null);
});

const prices = new Map([['Product', { retailPrice: 100, bplPrice: 80 }]]);

for (const amount of [undefined, null, '', '  ', '\u00a0']) {
  test(`empty optional amount does not fabricate price or discount: ${JSON.stringify(amount)}`, () => {
    const sale = parse(2, amount, prices);
    assert.equal(sale[7], 2);
    assert.equal(sale[8], null);
    assert.equal(sale[18], null);
    assert.equal(sale[19], null);
    assert.equal(sale[21], null);
  });
}

test('zero amount is preserved and still follows the existing return classification', () => {
  const sale = parse(2, 0, prices);
  assert.equal(sale[8], 0);
  assert.equal(sale[18], 0);
  assert.equal(sale[19], 'Повернення');
  assert.equal(sale[21], 'Повернення');
});

test('valid localized and negative amounts retain their values', () => {
  assert.equal(parse(2, '120,50')[8], 120.5);
  assert.equal(parse(2, '120,50')[18], 60.25);
  assert.equal(parse(2, -120)[8], -120);
  assert.equal(parse(2, -120)[18], -60);
});

for (const amount of ['unknown', true, Infinity, '120 UAH']) {
  test(`nonempty invalid amount still fails: ${String(amount)}`, () => {
    assert.throws(() => parse(2, amount), /sales.xls, рядок 1234: Сума/);
  });
}
