import test from 'node:test';
import assert from 'node:assert/strict';
import { canViewVmd, vmdAggregate } from '../src/utils/reportVmd.js';
import { shapeHierarchyReport } from '../src/utils/salesHierarchyReport.js';

test('VMD is exposed only to admin, manager and supervisor in rows and totals', () => {
  const rows = [{ level: -1, vmd: '123.45' }, { level: 0, label: 'Товар', dimensions: { product: 'Товар' }, vmd: '-12.50' }];
  for (const role of ['admin', 'manager', 'supervisor', 'agent', 'brand_manager', undefined, 'unknown']) {
    const allowed = ['admin', 'manager', 'supervisor'].includes(role);
    assert.equal(canViewVmd(role), allowed);
    const result = shapeHierarchyReport(rows, 'product', { includeVmd: canViewVmd(role) });
    assert.equal(Object.hasOwn(result.rows[0], 'vmd'), allowed);
    assert.equal(Object.hasOwn(result.totals, 'vmd'), allowed);
    if (allowed) {
      assert.equal(result.rows[0].vmd, -12.5);
      assert.equal(result.totals.vmd, 123.45);
    }
  }
  assert.equal(Object.hasOwn(shapeHierarchyReport(rows, 'product').totals, 'vmd'), false);
});

test('missing VMD remains null; actual zero remains zero', () => {
  for (const value of [null, undefined, 'invalid', 0]) {
    const result = shapeHierarchyReport([{ level: -1, vmd: value }], 'brand', { includeVmd: true });
    assert.equal(result.totals.vmd, value === 0 ? 0 : null);
  }
});

test('VMD uses the approved purchase-price condition with ELSE zero before summing', () => {
  const sql = vmdAggregate('price', 'purchase_price', 'qty');
  assert.match(sql, /SUM\(CASE\s+WHEN purchase_price > 0 THEN \(price - purchase_price\) \* qty\s+ELSE 0\s+END\)/);
  assert.match(sql, /COALESCE/);
  assert.ok(!sql.includes('THEN NULL'));
});
