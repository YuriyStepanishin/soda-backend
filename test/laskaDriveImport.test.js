import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runLaskaDriveImports } from '../src/services/laskaDriveImportRunner.js';

const version = '2026-10-30T12:00:00.000Z';
const file = { id: 'one', name: '10.xlsx', modifiedTime: version, version: '7', parents: ['uploads'] };
async function fixture(t, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'laska-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const actions = [];
  const args = {
    uploadsFolder: 'uploads', archiveFolder: 'archive', tempRoot: root,
    drive: { files: {
      list: async request => { assert.ok(!request.q.includes('archive')); return { data: { files: [file] } }; },
      get: async request => request.fileId === 'archive'
        ? { data: { id: 'archive', mimeType: 'application/vnd.google-apps.folder', parents: ['uploads'], capabilities: { canAddChildren: true } } }
        : request.fileId === 'uploads' ? { data: { capabilities: { canRemoveChildren: true } } }
        : request.alt === 'media'
        ? { data: Readable.from(['workbook']) }
        : { data: { ...file, capabilities: { canMoveItemWithinDrive: true }, ...options.current } },
      update: async request => { actions.push('archive'); assert.equal(request.addParents, 'archive'); assert.equal(request.removeParents, 'uploads'); assert.equal(request.requestBody, undefined); },
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

test('archive follows committed import and persisted sync record', async t => {
  const {args, actions, root} = await fixture(t);
  const summary = await runLaskaDriveImports(args);
  assert.deepEqual(actions, ['import', 'sync', 'archive']);
  assert.equal(summary.archived, 1);
  assert.deepEqual(await fs.readdir(root), []);
});
for (const cause of ['importError', 'syncError', 'empty']) {
  test(`${cause}: source retained and temporary files cleaned`, async t => {
    const {args, actions, root} = await fixture(t, { [cause]: true });
    await assert.rejects(runLaskaDriveImports(args));
    assert.ok(!actions.includes('archive'));
    assert.deepEqual(await fs.readdir(root), []);
  });
}
test('retry cleanup without reimporting the same version', async t => {
  const {args, actions} = await fixture(t, { records: [{file_id:'one',modified_time:version,imported_rows:5}] });
  await runLaskaDriveImports(args);
  assert.deepEqual(actions, ['archive']);
});
test('file modified during import is retained', async t => {
  const {args, actions} = await fixture(t, { current: { modifiedTime: '2026-10-31T12:00:00Z' } });
  const result = await runLaskaDriveImports(args);
  assert.deepEqual(actions, ['import', 'sync']);
  assert.equal(result.cleanupErrors.length, 1);
});
test('missing move permission retains the source after successful import', async t => {
  const {args, actions} = await fixture(t, { current: { capabilities: {canMoveItemWithinDrive:false} } });
  const result = await runLaskaDriveImports(args);
  assert.equal(result.processed, 1);
  assert.equal(result.cleanupErrors.length, 1);
  assert.deepEqual(actions, ['import', 'sync']);
});

test('LASKA commits and archives workbooks individually in listed order', async t => {
  const { args, actions } = await fixture(t);
  const files = [file, { ...file, id: 'two', name: '11.xlsx', version: '8' }];
  const originalGet = args.drive.files.get;
  args.drive.files.list = async request => {
    assert.equal(request.orderBy, 'modifiedTime');
    return { data: { files } };
  };
  args.drive.files.get = async request => request.fileId === 'two' && request.alt !== 'media'
    ? { data: { ...files[1], capabilities: { canMoveItemWithinDrive: true } } }
    : originalGet(request);
  args.importService = async batch => {
    assert.equal(batch.length, 1);
    actions.push(`import:${batch[0].id}`);
    return { rowsByFile: { [batch[0].id]: 5 } };
  };
  await runLaskaDriveImports(args);
  assert.deepEqual(actions, ['import:one', 'sync', 'archive', 'import:two', 'sync', 'archive']);
});

test('failed archive retries from the persisted version without another import', async t => {
  const { args, actions } = await fixture(t);
  const records = [];
  args.getRecords = async () => records;
  args.saveRecord = async record => {
    actions.push('sync');
    records.push({ file_id: record.fileId, imported_rows: record.importedRows, modified_time: record.modifiedTime });
  };
  const originalUpdate = args.drive.files.update;
  args.drive.files.update = async () => { throw new Error('403 denied'); };
  const first = await runLaskaDriveImports(args);
  assert.equal(first.processed, 1);
  assert.equal(first.archived, 0);
  assert.equal(first.cleanupErrors.length, 1);
  args.drive.files.update = originalUpdate;
  const retry = await runLaskaDriveImports(args);
  assert.equal(retry.processed, 0);
  assert.equal(retry.archived, 1);
  assert.deepEqual(actions, ['import', 'sync', 'archive']);
});
