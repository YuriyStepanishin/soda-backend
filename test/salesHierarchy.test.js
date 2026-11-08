import test from 'node:test';
import assert from 'node:assert/strict';
process.env.OLGATORG_NEON_URL = 'postgresql://localhost/olga';
process.env.LASKA_NEON_URL = 'postgresql://localhost/laska';
const { pools } = await import('../src/db/index.js');
const { laskaSalesAdapter } = await import('../src/modules/sales/adapters/laskaSalesAdapter.js');
const { olgatorgSalesAdapter } = await import('../src/modules/sales/adapters/olgatorgSalesAdapter.js');
const { shapeHierarchyReport } = await import('../src/utils/salesHierarchyReport.js');
const response = () => ({ status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
const calls = [];
let data = [];
for (const [tenant, pool] of Object.entries(pools)) pool.query = async (sql, params) => {
  calls.push({ tenant, sql, params });
  return { rows: data };
};
const aggregate = (level, a, b, quantity, stores, sku) => ({
  level, dimension_0: a, dimension_1: b, quantity, weight: quantity, amount: quantity * 10, stores, sku,
});
for (const [tenant, adapter] of [['laska', laskaSalesAdapter], ['olgatorg', olgatorgSalesAdapter]]) {
  test(tenant + ': report API enforces VMD roles even with a forged query flag', async () => {
    data = [{ ...aggregate(-1, null, null, 2, 1, 1), vmd: '15.50' }, { ...aggregate(0, 'Brand', null, 2, 1, 1), vmd: '15.50' }];
    for (const role of ['admin', 'manager', 'supervisor', 'agent', 'brand_manager']) {
      calls.length = 0;
      const res = response();
      await adapter.report({ query: { reportBy: 'brand', includeVmd: 'true' }, user: { role, representative: 'Allowed', departments: ['Department'], brands: ['Brand'] } }, res);
      const allowed = ['admin', 'manager', 'supervisor'].includes(role);
      assert.equal(res.code, undefined);
      assert.equal(Object.hasOwn(res.body.totals, 'vmd'), allowed);
      assert.equal(Object.hasOwn(res.body.rows[0], 'vmd'), allowed);
      assert.equal(calls[0].sql.includes(' AS vmd'), allowed);
      if (allowed) assert.equal(res.body.totals.vmd, 15.5);
    }
  });
  test(tenant + ': hierarchy order, SQL grand total, distinct metrics and authorization survive', async () => {
    data = [
      aggregate(-1, null, null, 17, 1, 2),
      aggregate(0, 'A', null, 10, 1, 1), aggregate(1, 'A', 'Same product', 10, 1, 1),
      aggregate(0, 'B', null, 7, 1, 1), aggregate(1, 'B', 'Same product', 7, 1, 1),
    ];
    for (const reportBy of ['brand,product', 'product,brand']) {
      calls.length = 0;
      const res = response();
      await adapter.report({ query: { reportBy, dateFrom: '2026-11-01', dateTo: '2026-11-07' },
        user: { role: 'agent', representative: 'Allowed' } }, res);
      assert.equal(res.code, undefined);
      assert.equal(res.body.reportBy, reportBy);
      assert.equal(res.body.rows.length, 4);
      assert.equal(new Set(res.body.rows.map(row => row.id)).size, 4);
      assert.equal(res.body.totals.quantity, 17);
      assert.equal(res.body.totals.amount, 170);
      assert.equal(res.body.totals.stores, 1); // Same outlet across several groups.
      assert.equal(res.body.totals.sku, 2);
      assert.deepEqual(Object.keys(res.body.rows[1].dimensions), reportBy.split(','));
      assert.equal(calls.length, 1);
      assert.equal(calls[0].tenant, tenant);
      assert.match(calls[0].sql, /GROUP BY GROUPING SETS \(\(\),/);
      assert.match(calls[0].sql, /COUNT\(DISTINCT[\s\S]*AS sku/);
      assert.ok(calls[0].params.flat().includes('Allowed'));
      assert.ok(calls[0].params.includes('2026-11-01'));
    }
  });
  test(tenant + ': duplicate hierarchy fields are rejected before any query', async () => {
    calls.length = 0;
    const res = response();
    await adapter.report({ query: { reportBy: 'brand,brand' }, user: { role: 'admin' } }, res);
    assert.equal(res.code, 400);
    assert.equal(calls.length, 0);
  });
  test(tenant + ': empty sales return zero total without a fake group', async () => {
    data = [aggregate(-1, null, null, 0, 0, 0)];
    const res = response();
    await adapter.report({ query: { reportBy: 'brand' }, user: { role: 'admin' } }, res);
    assert.deepEqual(res.body.rows, []);
    assert.equal(res.body.totals.amount, 0);
  });
}
test('missing grand total fails instead of silently summing nested groups', () => {
  assert.throws(() => shapeHierarchyReport([], 'brand'), /grand total/);
});
