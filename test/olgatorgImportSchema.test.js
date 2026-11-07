import test from 'node:test';
import assert from 'node:assert/strict';

process.env.OLGATORG_NEON_URL = 'postgresql://localhost/olga';
process.env.LASKA_NEON_URL = 'postgresql://localhost/laska';
const { pools } = await import('../src/db/index.js');
const { importOlgatorgSales } = await import('../src/services/olgatorgSalesImportService.js');

pools.olgatorg.query = async () => ({ rows: [] });

test('incompatible unique index aborts before opening the workbook or staging sales', async () => {
  const calls = [];
  let released = false;
  pools.olgatorg.connect = async () => ({
    query: async sql => {
      calls.push(sql);
      return { rows: sql.includes('FROM pg_indexes') ? [{ indexname: 'sales_unique_row' }] : [] };
    },
    release: () => { released = true; },
  });
  await assert.rejects(importOlgatorgSales([{ filePath: 'missing-workbook.xls', name: 'sales.xls' }]), /sales_unique_row/);
  assert.equal(calls[0], 'BEGIN');
  assert.match(calls[1], /pg_advisory_xact_lock/);
  assert.match(calls[2], /FROM pg_indexes/);
  assert.equal(calls.at(-1), 'ROLLBACK');
  assert.ok(released);
  assert.ok(!calls.some(sql => /CREATE TEMP TABLE|INSERT INTO|DELETE FROM|COMMIT/.test(sql)));
});
