import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runLaskaDriveImports } from '../src/services/laskaDriveImportRunner.js';

const version = '2026-10-30T12:00:00.000Z';
const file = { id: 'one', name: '10.xlsx', modifiedTime: version, parents: ['uploads'] };
async function fixture(t, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'laska-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const actions = [];
  const args = {
    uploadsFolder: 'uploads', tempRoot: root,
    drive: { files: {
      list: async request => { assert.ok(!request.q.includes('archive')); return { data: { files: [file] } }; },
      get: async request => request.alt === 'media'
        ? { data: Readable.from(['workbook']) }
        : { data: { ...file, capabilities: { canTrash: true }, ...options.current } },
      update: async request => { actions.push('trash'); assert.deepEqual(request.requestBody, { trashed: true }); },
    } },
    getRecords: async () => options.records || [],
    saveRecord: async () => { actions.push('sync'); if (options.syncError) throw new Error('sync failed'); },
    importService: async () => {
      actions.push('import');
      if (options.importError) throw new Error('import failed');
      return { inserted: 5, deleted: 2, rowsByFile: { one: options.empty ? 0 : 5 } };
    },
  };
  return { args, actions, root };
}

test('trash follows committed import and persisted sync record', async t => {
  const {args, actions, root} = await fixture(t);
  const summary = await runLaskaDriveImports(args);
  assert.deepEqual(actions, ['import', 'sync', 'trash']);
  assert.equal(summary.trashed, 1);
  assert.deepEqual(await fs.readdir(root), []);
});
for (const cause of ['importError', 'syncError', 'empty']) {
  test(`${cause}: source retained and temporary files cleaned`, async t => {
    const {args, actions, root} = await fixture(t, { [cause]: true });
    await assert.rejects(runLaskaDriveImports(args));
    assert.ok(!actions.includes('trash'));
    assert.deepEqual(await fs.readdir(root), []);
  });
}
test('retry cleanup without reimporting the same version', async t => {
  const {args, actions} = await fixture(t, { records: [{file_id:'one',modified_time:version,imported_rows:5}] });
  await runLaskaDriveImports(args);
  assert.deepEqual(actions, ['trash']);
});
test('file modified during import is retained', async t => {
  const {args, actions} = await fixture(t, { current: { modifiedTime: '2026-10-31T12:00:00Z' } });
  const result = await runLaskaDriveImports(args);
  assert.deepEqual(actions, ['import', 'sync']);
  assert.equal(result.cleanupErrors.length, 1);
});
test('missing trash permission does not report import failure or trash the source', async t => {
  const {args, actions} = await fixture(t, { current: { capabilities: {canTrash:false} } });
  const result = await runLaskaDriveImports(args);
  assert.equal(result.processed, 1);
  assert.equal(result.cleanupErrors.length, 1);
  assert.deepEqual(actions, ['import', 'sync']);
});
