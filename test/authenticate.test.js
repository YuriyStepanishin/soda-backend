import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
process.env.JWT_SECRET = 'test-only-auth-secret';
process.env.OLGATORG_NEON_URL = 'postgresql://localhost/olga';
process.env.LASKA_NEON_URL = 'postgresql://localhost/laska';
const { pools } = await import('../src/db/index.js');
const { authenticate } = await import('../src/middleware/authenticate.js');
const { createRouteHistoryPlan } = await import('../src/models/laskaRouteHistoryModel.js');
const email = 'karvan.sm006@gmail.com';
const res = () => ({ status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
const request = token => ({ headers: { authorization: `Bearer ${token}` } });
const token = options => jwt.sign({ id: 8, email }, process.env.JWT_SECRET, options);
test('valid token resolves Horetska to the actual Cyrillic agent used by sales queries', async () => {
  pools.laska.query = async () => ({ rows: [{ id: 8, email, role: 'agent' }] });
  const req = request(token({ expiresIn: '7d' }));
  let accepted = false;
  await authenticate(req, res(), () => { accepted = true; });
  assert.ok(accepted);
  assert.equal(req.user.representative, 'Горецька Тетяна Петрівна');
  const plan = createRouteHistoryPlan({ query: { view: 'stores' }, user: req.user });
  assert.ok(plan.stores.params.some(value => Array.isArray(value) && value.includes('Горецька Тетяна Петрівна')));
});
test('expired and invalid tokens return 401 without querying the database', async () => {
  pools.laska.query = () => assert.fail('database must not be queried');
  for (const value of [token({ expiresIn: -1 }), 'invalid', jwt.sign({ id: 8 }, process.env.JWT_SECRET)]) {
    const response = res();
    await authenticate(request(value), response, () => assert.fail('invalid session accepted'));
    assert.equal(response.code, 401);
  }
});
test('temporary database failure returns 503, preserving a valid JWT and offline fallback', async () => {
  pools.laska.query = async () => { throw Error('database unavailable'); };
  const response = res();
  await authenticate(request(token({ expiresIn: '7d' })), response, () => assert.fail('unresolved session accepted'));
  assert.equal(response.code, 503);
});
test('removed user returns 403', async () => {
  pools.laska.query = async () => ({ rows: [] });
  const response = res();
  await authenticate(request(token({ expiresIn: '7d' })), response, () => assert.fail('removed user accepted'));
  assert.equal(response.code, 403);
});
