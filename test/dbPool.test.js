import test from 'node:test';
import assert from 'node:assert/strict';

process.env.OLGATORG_NEON_URL ||= 'postgres://test:test@localhost/olgatorg';
process.env.LASKA_NEON_URL ||= 'postgres://test:test@localhost/laska';

const { pools } = await import('../src/db/index.js');

test('database pool errors are logged instead of becoming uncaught errors', () => {
  const originalError = console.error;
  const loggedErrors = [];
  console.error = (...args) => loggedErrors.push(args);

  try {
    const error = new Error('Connection terminated unexpectedly');

    for (const pool of Object.values(pools)) {
      assert.doesNotThrow(() => pool.emit('error', error));
    }

    assert.equal(loggedErrors.length, Object.keys(pools).length);
    assert.ok(loggedErrors.every(([message]) => message.includes('Database pool error')));
  } finally {
    console.error = originalError;
  }
});
