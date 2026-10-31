import test from 'node:test';
import assert from 'node:assert/strict';
process.env.OLGATORG_NEON_URL = 'postgresql://localhost/olga';
process.env.LASKA_NEON_URL = 'postgresql://localhost/laska';
const { pools, getPool } = await import('../src/db/index.js');
const { resolveSalesTenant, validateSalesTenantHeader } = await import('../src/middleware/tenant.js');
const { validateDailyDateRange } = await import('../src/utils/dailySalesQuery.js');
const { getSalesByDays: laskaDays, getSalesByDaysFilters: laskaFilters } = await import('../src/models/laskaSalesModel.js');
const { getSalesByDays: olgaDays } = await import('../src/models/olgatorgSalesModel.js');
const calls = [];
for (const [tenant, pool] of Object.entries(pools)) {
  pool.query = async (sql, params) => { calls.push({ tenant, sql, params }); return { rows: [] }; };
}
const response = () => ({ status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
test('reject malformed, multiple or duplicate company headers before any DB access', () => {
  for (const tenant of ['laska,olgatorg', 'laska, laska', ['laska'], 'unknown', '', 'toString']) {
    const res = response();
    validateSalesTenantHeader({ headers: { 'x-tenant-id': tenant } }, res, () => assert.fail('invalid header accepted'));
    assert.equal(res.code, 400);
    assert.throws(() => getPool(tenant));
  }
  assert.equal(calls.length, 0);
});
test('admin must choose; non-admin cannot cross company boundaries; both adapters support daily sales', () => {
  const res = response();
  resolveSalesTenant()({ headers: {}, user: { role: 'admin', tenantAdmin: 'olgatorg' } }, res, () => assert.fail('implicit company'));
  assert.equal(res.code, 403);
  for (const tenant of ['laska', 'olgatorg']) {
    const req = { headers: { 'x-tenant-id': tenant }, user: { role: 'admin' } };
    let accepted = false;
    resolveSalesTenant()(req, response(), () => { accepted = true; });
    assert.ok(accepted);
    assert.equal(req.salesTenant, tenant);
    assert.equal(typeof req.salesAdapter.byDays, 'function');
    assert.equal(typeof req.salesAdapter.byDaysFilters, 'function');
    const blocked = response();
    resolveSalesTenant()({ headers: { 'x-tenant-id': tenant }, user: { role: 'agent', tenant: tenant === 'laska' ? 'olgatorg' : 'laska' } }, blocked, () => assert.fail('cross-company access'));
    assert.equal(blocked.code, 403);
  }
});
test('reject impossible dates, arrays and reversed ranges', () => {
  for (const range of [{ dateFrom: '2026-02-30' }, { dateTo: '2026-13-01' }, { dateFrom: ['2026-10-01'] }, { dateFrom: '2026-10-31', dateTo: '2026-10-01' }]) assert.ok(validateDailyDateRange(range));
  assert.equal(validateDailyDateRange({ dateFrom: '2024-02-29', dateTo: '2026-10-31' }), null);
});
test('one aggregate query to the selected pool; no unused dictionary joins', async () => {
  calls.length = 0;
  await laskaDays({ dateFrom: '2026-10-01', dateTo: '2026-10-31' });
  await olgaDays({ where: 'WHERE sale_date >= $1::date', params: ['2026-10-01'] });
  assert.deepEqual(calls.map(call => call.tenant), ['laska', 'olgatorg']);
  for (const { sql } of calls) {
    assert.match(sql, /TO_CHAR\(.*'YYYY-MM-DD'/);
    assert.match(sql, /store_amount >= 500/);
    assert.doesNotMatch(sql, /daily_weight|REPLACE/);
  }
  assert.doesNotMatch(calls[0].sql, /JOIN/);
});
test('only three daily filter dictionaries; supervisor scope survives removing UI selections', async () => {
  calls.length = 0;
  await laskaFilters({ query: { department: 'forbidden', agent: 'somebody', dateFrom: '2026-10-01' }, user: { role: 'supervisor', departments: ['Allowed'] } });
  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.equal(call.tenant, 'laska');
    assert.ok(call.params.some(value => Array.isArray(value) && value.includes('Allowed')));
    assert.match(call.sql, /a\.department = ANY/);
  }
});
