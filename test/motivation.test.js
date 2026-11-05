import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, stateSchema, requireMotivationAccess } from '../src/modules/motivation/motivation.domain.js';
import { createMotivationRepository } from '../src/modules/motivation/motivation.repository.js';
const response = () => ({ status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
const record = () => ({ id: 'r1', agent: '1', route: 'Маршрут', date: '2026-11-05', direction: 'АКБ', actual: 8, target: 10, status: 'підтверджено', evidence: 'Звіт 5', owner: 'Перевіряльник' });
test('only LASKA manager and explicitly selected LASKA admin may use the module', () => {
  for (const user of [{ role: 'agent', tenant: 'laska' }, { role: 'supervisor', tenant: 'laska' }, { role: 'brand_manager', tenant: 'laska' }, { role: 'manager', tenant: 'olgatorg' }, undefined]) {
    const res = response(); requireMotivationAccess({ user, headers: { 'x-tenant-id': 'laska' } }, res, () => assert.fail()); assert.equal(res.code, 403);
  }
  for (const tenant of [undefined, 'olgatorg', 'laska,olgatorg', ['laska'], '']) {
    const res = response(); requireMotivationAccess({ user: { role: 'admin' }, headers: { 'x-tenant-id': tenant } }, res, () => assert.fail()); assert.equal(res.code, 400);
  }
  for (const user of [{ role: 'manager', tenant: 'laska' }, { role: 'admin' }]) {
    let called = false; requireMotivationAccess({ user, headers: { 'x-tenant-id': 'laska' } }, response(), () => { called = true; }); assert.ok(called);
  }
});
test('confirmed results need evidence, owner and numeric fact/target; missing results remain null', () => {
  const data = initialState(); data.records.push(record()); assert.ok(stateSchema.safeParse(data).success);
  for (const patch of [{ evidence: '' }, { owner: ' ' }, { actual: null }, { target: null }, { actual: -1 }, { target: 0 }, { date: '2026-02-30' }, { direction: 'Unknown' }, { term: -1 }, { term: 1.5 }]) {
    assert.equal(stateSchema.safeParse({ ...data, records: [{ ...record(), ...patch }] }).success, false, JSON.stringify(patch));
  }
  assert.ok(stateSchema.safeParse({ ...data, records: [{ ...record(), status: 'не перевірено', actual: null, target: null, evidence: '', owner: '' }] }).success);
  assert.equal(data.records[0].actual, 8);
});
test('imports reject duplicate IDs, unknown agents and invalid team size atomically', () => {
  const data = initialState();
  for (const modified of [{ ...data, agents: data.agents.slice(1) }, { ...data, agents: data.agents.map(() => data.agents[0]) }, { ...data, records: [record(), record()] }, { ...data, records: [{ ...record(), agent: 'unknown' }] }]) assert.equal(stateSchema.safeParse(modified).success, false);
});
function fakePool({ conflict = false, auditFailure = false } = {}) {
  const calls = []; let released = false;
  const client = { async query(sql, params) {
    calls.push({ sql, params });
    if (sql.startsWith('UPDATE')) return { rows: conflict ? [] : [{ revision: 4 }] };
    if (sql.startsWith('INSERT INTO motivation_history')) { if (auditFailure) throw Error('audit failure'); return { rows: [{ id: params[0], revision: params[1], actor: params[2], action: params[3] }] }; }
    return { rows: [] };
  }, release() { released = true; } };
  return { calls, get released() { return released; }, query: async () => ({ rows: [] }), connect: async () => client };
}
test('state and actor-stamped history commit in the same transaction', async () => {
  const pool = fakePool(), repo = createMotivationRepository(pool);
  const saved = await repo.write({ data: initialState(), revision: 3, action: 'Перевірка' }, 'manager@example.test');
  assert.equal(saved.revision, 4); assert.equal(saved.history.actor, 'manager@example.test');
  assert.equal(pool.calls[0].sql, 'BEGIN'); assert.equal(pool.calls.at(-1).sql, 'COMMIT'); assert.ok(pool.released);
  const update = pool.calls.find(c => c.sql.startsWith('UPDATE')); assert.equal(update.params[1], 3); assert.match(update.sql, /WHERE id = 1 AND revision = \$2/);
});
test('stale revision rolls back without creating a history record', async () => {
  const pool = fakePool({ conflict: true });
  await assert.rejects(createMotivationRepository(pool).write({ data: initialState(), revision: 0, action: 'Перевірка' }, 'manager'), { status: 409 });
  assert.equal(pool.calls.at(-1).sql, 'ROLLBACK'); assert.ok(pool.released);
  assert.equal(pool.calls.some(c => c.sql.startsWith('INSERT INTO motivation_history')), false);
});
test('audit failure rolls back state update and releases the connection', async () => {
  const pool = fakePool({ auditFailure: true });
  await assert.rejects(createMotivationRepository(pool).write({ data: initialState(), revision: 3, action: 'Перевірка' }, 'manager'), /audit failure/);
  assert.equal(pool.calls.at(-1).sql, 'ROLLBACK'); assert.ok(pool.released);
});
