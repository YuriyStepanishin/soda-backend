import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runOlgatorgDriveImports } from '../src/services/olgatorgDriveImportRunner.js';
const version = '2026-10-31T12:00:00.000Z';
const files = ['one', 'two'].map(id => ({ id, name: 'sales.xls', modifiedTime: version, parents: ['uploads'] }));
async function fixture(t, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'olga-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const actions = [];
  return { actions, root, args: {
    uploadsFolder: 'uploads', tempRoot: root,
    drive: { files: {
      list: async req => { assert.ok(!req.q.includes('archive')); return { data: { files } }; },
      get: async req => req.alt === 'media' ? { data: Readable.from(['workbook']) }
        : { data: { ...files.find(file => file.id === req.fileId), capabilities: { canTrash: true }, ...options.current } },
      update: async req => { actions.push(`trash:${req.fileId}`); assert.deepEqual(req.requestBody, { trashed: true }); },
    } },
    getRecords: async () => options.records || [],
    saveRecords: async records => { actions.push('sync'); assert.equal(records.length, 2); if (options.syncError) throw new Error('sync failed'); },
    importService: async batch => {
      actions.push('import');
      assert.equal(batch.length, 2, 'all date fragments imported together');
      assert.notEqual(batch[0].filePath, batch[1].filePath, 'duplicate names have separate paths');
      if (options.importError) throw new Error('import failed');
      return { inserted: 10, deleted: 4, rowsByFile: { one: options.empty ? 0 : 5, two: 5 } };
    },
  } };
}
test('commit one batch, persist all versions, then trash sources', async t => {
  const {args, actions, root} = await fixture(t);
  const summary = await runOlgatorgDriveImports(args);
  assert.deepEqual(actions, ['import', 'sync', 'trash:one', 'trash:two']);
  assert.equal(summary.trashed, 2);
  assert.deepEqual(await fs.readdir(root), []);
});
for (const cause of ['importError', 'syncError', 'empty']) {
  test(`${cause}: retain every source and clean temporary downloads`, async t => {
    const {args, actions, root} = await fixture(t, { [cause]: true });
    await assert.rejects(runOlgatorgDriveImports(args));
    assert.ok(actions.every(action => !action.startsWith('trash:')));
    assert.deepEqual(await fs.readdir(root), []);
  });
}
test('retry only cleanup for an already recorded batch', async t => {
  const {args, actions} = await fixture(t, { records: files.map(file => ({ file_id: file.id, imported_rows: 5, modified_time: version })) });
  await runOlgatorgDriveImports(args);
  assert.deepEqual(actions, ['trash:one', 'trash:two']);
});
for (const current of [{ modifiedTime: '2026-11-01T12:00:00Z' }, { parents: ['elsewhere'] }, { capabilities: { canTrash: false } }]) {
  test(`retain changed, moved or untrashable files: ${JSON.stringify(current)}`, async t => {
    const {args, actions} = await fixture(t, {current});
    const result = await runOlgatorgDriveImports(args);
    assert.deepEqual(actions, ['import', 'sync']);
    assert.equal(result.cleanupErrors.length, 2);
  });
}
