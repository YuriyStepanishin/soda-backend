import test from 'node:test';
import assert from 'node:assert/strict';
import { createSalesResponseCache } from '../src/middleware/salesResponseCache.js';

const request = (patch = {}) => ({ method: 'GET', salesTenant: 'laska', user: { id: 1, role: 'manager', departments: ['A'] }, path: '/report', query: { dateFrom: '2026-11-01' }, ...patch });
const response = () => ({ statusCode: 200, headers: {}, set(key, value) { this.headers[key] = value; return this; }, vary() {}, type() { return this; }, send(body) { this.body = body; return this; }, json(body) { this.body = JSON.stringify(body); return this; } });
function execute(cache, req = request(), body = { success: true, rows: [{ vmd: 25 }] }, statusCode = 200) {
  const res = response();
  let computed = false;
  cache.middleware(req, res, () => { computed = true; res.statusCode = statusCode; res.json(body); });
  return { res, computed };
}

test('identical authorized requests are reused with unchanged JSON', () => {
  const cache = createSalesResponseCache();
  const first = execute(cache);
  const second = execute(cache);
  assert.equal(first.computed, true);
  assert.equal(second.computed, false);
  assert.equal(second.res.body, first.res.body);
  assert.equal(second.res.headers['Cache-Control'], 'private, no-store');
});

test('tenant, identity, role, allowed departments, filters and route isolate cache entries', () => {
  const cache = createSalesResponseCache();
  execute(cache);
  for (const patch of [
    { salesTenant: 'olgatorg' }, { user: { id: 2, role: 'manager', departments: ['A'] } },
    { user: { id: 1, role: 'agent', departments: ['A'] } }, { user: { id: 1, role: 'manager', departments: ['B'] } },
    { query: { dateFrom: '2026-11-02' } }, { path: '/filters' },
  ]) assert.equal(execute(cache, request(patch)).computed, true);
});

test('query property ordering is canonical but hierarchy field order is preserved', () => {
  const cache = createSalesResponseCache();
  execute(cache, request({ query: { reportBy: 'brand,product', dateFrom: '2026-11-01' } }));
  assert.equal(execute(cache, request({ query: { dateFrom: '2026-11-01', reportBy: 'brand,product' } })).computed, false);
  assert.equal(execute(cache, request({ query: { dateFrom: '2026-11-01', reportBy: 'product,brand' } })).computed, true);
});

test('imports invalidate only their tenant, including in-flight pre-import results', () => {
  const cache = createSalesResponseCache();
  execute(cache);
  execute(cache, request({ salesTenant: 'olgatorg' }));
  const stale = response();
  cache.middleware(request({ query: { another: 'filter' } }), stale, () => {});
  cache.invalidate('laska');
  stale.json({ success: true, rows: ['stale'] });
  assert.equal(execute(cache).computed, true);
  assert.equal(execute(cache, request({ query: { another: 'filter' } })).computed, true);
  assert.equal(execute(cache, request({ salesTenant: 'olgatorg' })).computed, false);
});

test('errors and oversized results are not retained; requests still complete', () => {
  for (const [body, status] of [[{ success: false }, 200], [{ error: 'failed' }, 500]]) {
    const cache = createSalesResponseCache();
    execute(cache, request(), body, status);
    assert.equal(execute(cache, request(), body, status).computed, true);
  }
  const cache = createSalesResponseCache({ maxEntrySize: 40 });
  execute(cache);
  assert.equal(execute(cache).computed, true);
});

test('TTL expiry forces a new read; unauthenticated requests never hit the cache', async () => {
  const cache = createSalesResponseCache({ ttl: 10 });
  execute(cache);
  assert.equal(execute(cache, request({ user: null })).computed, true);
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(execute(cache).computed, true);
});
