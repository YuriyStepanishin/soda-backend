import test from 'node:test';
import assert from 'node:assert/strict';
import { archiveDriveFile, validateArchiveConfig } from '../src/services/driveArchive.js';

function fixture(overrides = {}) {
  const file = { id: 'file', modifiedTime: '2026-11-01T12:00:00Z', version: '7', parents: ['uploads'], capabilities: { canMoveItemWithinDrive: true } };
  const metadata = {
    archive: { mimeType: 'application/vnd.google-apps.folder', parents: ['uploads'], capabilities: { canAddChildren: true } },
    uploads: { capabilities: { canRemoveChildren: true } },
    file,
    ...overrides,
  };
  const moves = [];
  return { moves, args: { file, uploadsFolder: 'uploads', archiveFolder: 'archive', drive: { files: {
    get: async ({ fileId }) => ({ data: metadata[fileId], headers: { etag: 'revision-7' } }),
    update: async (request, options) => { moves.push(request); assert.equal(options.headers['If-Match'], 'revision-7'); },
  } } } };
}

test('move uses only the expected parent and conditional request', async () => {
  const { args, moves } = fixture();
  await archiveDriveFile(args);
  assert.equal(moves.length, 1);
  assert.equal(moves[0].addParents, 'archive');
  assert.equal(moves[0].removeParents, 'uploads');
  assert.equal(moves[0].requestBody, undefined);
});

test('missing or identical archive configuration is rejected', () => {
  assert.throws(() => validateArchiveConfig('uploads'));
  assert.throws(() => validateArchiveConfig('uploads', 'uploads'));
});

test('owner-created Archive alongside Uploads in the same tenant folder is accepted', async () => {
  const { args, moves } = fixture({
    archive: { mimeType: 'application/vnd.google-apps.folder', parents: ['tenant-root'], capabilities: { canAddChildren: true } },
    uploads: { parents: ['tenant-root'], capabilities: { canRemoveChildren: true } },
  });
  await archiveDriveFile(args);
  assert.equal(moves.length, 1);
  assert.equal(moves[0].addParents, 'archive');
});

test('a sibling Archive belonging to a different tenant is rejected', async () => {
  const { args, moves } = fixture({
    archive: { mimeType: 'application/vnd.google-apps.folder', parents: ['other-tenant'], capabilities: { canAddChildren: true } },
    uploads: { parents: ['tenant-root'], capabilities: { canRemoveChildren: true } },
  });
  await assert.rejects(archiveDriveFile(args), /same tenant/);
  assert.equal(moves.length, 0);
});

for (const overrides of [
  { archive: { mimeType: 'application/vnd.google-apps.folder', parents: ['other-tenant'], capabilities: { canAddChildren: true } } },
  { archive: { mimeType: 'application/vnd.google-apps.folder', parents: ['uploads'], capabilities: { canAddChildren: false } } },
  { archive: { mimeType: 'application/vnd.google-apps.folder', parents: ['uploads'], trashed: true } },
  { uploads: { capabilities: { canRemoveChildren: false } } },
  { uploads: { driveId: 'other-drive', capabilities: { canRemoveChildren: true } } },
  { file: { modifiedTime: '2026-11-01T12:00:00Z', version: '8', parents: ['uploads'] } },
]) {
  test(`unsafe move retained: ${JSON.stringify(overrides)}`, async () => {
    const { args, moves } = fixture(overrides);
    await assert.rejects(archiveDriveFile(args));
    assert.equal(moves.length, 0);
  });
}

test('concurrent edit rejection propagates without an unconditional retry', async () => {
  const { args } = fixture();
  let attempts = 0;
  args.drive.files.update = async () => { attempts += 1; throw new Error('412 Precondition Failed'); };
  await assert.rejects(archiveDriveFile(args), /412/);
  assert.equal(attempts, 1);
});
