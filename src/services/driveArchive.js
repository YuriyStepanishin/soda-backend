export function validateArchiveConfig(uploadsFolder, archiveFolder) {
  if (!archiveFolder) throw new Error('Archive folder ID is not configured');
  if (archiveFolder === uploadsFolder) throw new Error('Archive must differ from uploads');
}

export async function getArchiveFolder(drive, uploadsFolder, archiveFolder) {
  validateArchiveConfig(uploadsFolder, archiveFolder);
  const { data: archive } = await drive.files.get({
    fileId: archiveFolder,
    fields: 'id,mimeType,parents,trashed,driveId,capabilities(canAddChildren)',
    supportsAllDrives: true,
  });
  if (archive.trashed || archive.mimeType !== 'application/vnd.google-apps.folder') {
    throw new Error('Archive must be an active folder');
  }
  if (!archive.parents?.includes(uploadsFolder)) {
    const { data: uploads } = await drive.files.get({
      fileId: uploadsFolder, fields: 'id,parents', supportsAllDrives: true,
    });
    if (!uploads.parents?.some(parent => archive.parents?.includes(parent))) {
      throw new Error('Archive must be inside uploads or alongside uploads in the same tenant folder');
    }
  }
  if (!archive.capabilities?.canAddChildren) throw new Error('Drive account cannot add files to archive');
  return archive;
}

export async function archiveDriveFile({ drive, file, uploadsFolder, archiveFolder }) {
  const archive = await getArchiveFolder(drive, uploadsFolder, archiveFolder);
  const { data: source } = await drive.files.get({
    fileId: uploadsFolder,
    fields: 'id,trashed,driveId,capabilities(canRemoveChildren)',
    supportsAllDrives: true,
  });
  if (source.trashed || !source.capabilities?.canRemoveChildren) {
    throw new Error('Drive account cannot remove files from uploads');
  }
  const response = await drive.files.get({
    fileId: file.id,
    fields: 'id,modifiedTime,version,parents,trashed,driveId,capabilities(canMoveItemWithinDrive)',
    supportsAllDrives: true,
  });
  const current = response.data;
  if (current.trashed || !file.modifiedTime || current.modifiedTime !== file.modifiedTime ||
      !file.version || String(current.version) !== String(file.version) ||
      !current.parents?.includes(uploadsFolder)) {
    throw new Error('File changed or moved after listing; retained');
  }
  if ((current.driveId || '') !== (archive.driveId || '') ||
      (source.driveId || '') !== (archive.driveId || '')) {
    throw new Error('Archive and source must be in the same Drive');
  }
  if (!current.capabilities?.canMoveItemWithinDrive) throw new Error('Drive account cannot move this file');
  const etag = response.headers?.get?.('etag') || response.headers?.etag;
  await drive.files.update({
    fileId: file.id,
    addParents: archiveFolder,
    removeParents: uploadsFolder,
    fields: 'id,parents',
    supportsAllDrives: true,
  }, etag ? { headers: { 'If-Match': etag } } : {});
}
