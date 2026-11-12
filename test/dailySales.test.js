import test from 'node:test';
import assert from 'node:assert/strict';
process.env.OLGATORG_NEON_URL = 'postgresql://localhost/olga';
process.env.LASKA_NEON_URL = 'postgresql://localhost/laska';
const { pools, getPool } = await import('../src/db/index.js');
const { resolveSalesTenant, validateSalesTenantHeader } = await import('../src/middleware/tenant.js');
const { validateDailyDateRange } = await import('../src/utils/dailySalesQuery.js');
const { getSalesByDays: laskaDays, getSalesByDaysFilters: laskaFilters } = await import('../src/models/laskaSalesModel.js');
const { getFilters: laskaReportFilters } = await import('../src/models/laskaSalesModel.js');
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
test('one aggregate query to the selected pool; LASKA uses agent departments for operational dates', async () => {
  calls.length = 0;
  await laskaDays({ dateFrom: '2026-10-01', dateTo: '2026-10-31' });
  await olgaDays({ where: 'WHERE sale_date >= $1::date', params: ['2026-10-01'] });
  assert.deepEqual(calls.map(call => call.tenant), ['laska', 'olgatorg']);
  for (const { sql } of calls) {
    assert.match(sql, /TO_CHAR\(.*'YYYY-MM-DD'/);
    assert.match(sql, /COUNT\(\*\)::int AS "storesCount"/);
    assert.doesNotMatch(sql, /daily_weight|REPLACE/);
  }
  assert.match(calls[0].sql, /LEFT JOIN public.agents a/);
  assert.doesNotMatch(calls[0].sql, /JOIN public.products/);
  assert.match(calls[0].sql, /THEN s\.sale_date ELSE s\.sale_date - 1 END/);
  assert.doesNotMatch(calls[1].sql, /CASE WHEN|sale_date - 1/);
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

test('report dictionaries remove only UI filters and retain mandatory role restrictions', async () => {
  for (const user of [{ role: 'agent', representative: 'Agent' }, { role: 'supervisor', departments: ['Department'] }, { role: 'brand_manager', brands: ['Brand'] }]) {
    calls.length = 0;
    await laskaReportFilters({ dateFrom: '2026-11-01' }, user);
    assert.equal(calls.length, 8);
    const expected = user.representative || user.departments?.[0] || user.brands?.[0];
    for (const call of calls) assert.ok(call.params.flat().includes(expected));
  }
});

test('unfiltered admin dictionaries use one aggregate scan instead of eight queries', async () => {
  calls.length = 0;
  const result = await laskaReportFilters({ dateFrom: '2026-11-01', dateTo: '2026-11-04' }, { role: 'admin' });
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /array_agg\(DISTINCT/);
  assert.deepEqual(Object.keys(result), ['departments', 'agents', 'stores', 'brands', 'groups', 'subgroups', 'packings', 'products']);
});

// The same operational date must control grouping, date ranges and dictionaries.
test('daily date filters include next-day documents and retain cash documents on their own date', async () => {
  calls.length = 0;
  await laskaDays({ dateFrom: '2026-12-31', dateTo: '2026-12-31', department: 'Каса' });
  const { sql, params } = calls[0];
  assert.match(sql, /END\) >= \$1/);
  assert.match(sql, /END\) <= \$2/);
  assert.match(sql, /a\.department = \$3/);
  assert.match(sql, /s\.sale_date >= \$4::date/);
  assert.match(sql, /s\.sale_date <= \$5::date \+ 1/);
  assert.deepEqual(params, ['2026-12-31', '2026-12-31', 'Каса', '2026-12-31', '2026-12-31']);
  calls.length = 0;
  await laskaFilters({ query: { dateFrom: '2026-12-31', dateTo: '2026-12-31' }, user: { role: 'admin' } });
  for (const { sql } of calls) {
    assert.match(sql, /THEN s\.sale_date ELSE s\.sale_date - 1 END\) >= \$1/);
    assert.match(sql, /END\) <= \$2/);
  }
});
