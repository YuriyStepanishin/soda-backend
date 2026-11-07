import fs from 'node:fs/promises';
import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { archiveDriveFile, validateArchiveConfig } from './driveArchive.js';

// OLGATORG exports can split one date across several workbooks. Commit them
// together, unlike LASKA's per-workbook date snapshots.
export async function runOlgatorgDriveImports({
  drive,
  uploadsFolder,
  archiveFolder,
  importService,
  getRecords,
  saveRecords,
  tempRoot,
}) {
  if (!uploadsFolder)
    throw new Error('OLGATORG_UPLOADS_FOLDER_ID is not configured');
  validateArchiveConfig(uploadsFolder, archiveFolder);
  const files = [];
  let pageToken;
  do {
    const response = await drive.files.list({
      q: `'${uploadsFolder}' in parents and trashed=false`,
      fields:
        'nextPageToken,files(id,name,mimeType,modifiedTime,version,parents)',
      orderBy: 'modifiedTime',
      pageSize: 1000,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    files.push(
      ...(response.data.files || []).filter((file) =>
        /\.(xlsx|xls)$/i.test(file.name || ''),
      ),
    );
    pageToken = response.data.nextPageToken;
  } while (pageToken);
  const records = new Map(
    (await getRecords()).map((record) => [record.file_id, record]),
  );
  const sameVersion = (file) => {
    const record = records.get(file.id);
    return (
      Number(record?.imported_rows) > 0 &&
      record?.modified_time &&
      file.modifiedTime &&
      new Date(record.modified_time).getTime() ===
        new Date(file.modifiedTime).getTime()
    );
  };
  const summary = {
    found: files.length,
    processed: 0,
    inserted: 0,
    deleted: 0,
    archived: 0,
    cleanupErrors: [],
  };
  if (files.some((file) => !sameVersion(file))) {
    await fs.mkdir(tempRoot, { recursive: true });
    const workDir = await fs.mkdtemp(path.join(tempRoot, 'olgatorg-'));
    try {
      const downloaded = [];
      for (const [index, file] of files.entries()) {
        // Separate paths also support duplicate workbook names in the inbox.
        const filePath = path.join(
          workDir,
          `${index}-${path.basename(file.name)}`,
        );
        const response = await drive.files.get(
          { fileId: file.id, alt: 'media', supportsAllDrives: true },
          { responseType: 'stream' },
        );
        await pipeline(response.data, createWriteStream(filePath));
        downloaded.push({ ...file, filePath });
      }
      const result = await importService(downloaded);
      const syncFiles = files.map((file) => {
        const importedRows = Number(result?.rowsByFile?.[file.id]);
        if (!Number.isInteger(importedRows) || importedRows <= 0) {
          throw new Error(
            `${file.name}: no imported rows; source files retained`,
          );
        }
        return {
          fileName: file.name,
          fileId: file.id,
          importedRows,
          modifiedTime: file.modifiedTime,
        };
      });
      await saveRecords(syncFiles);
      summary.processed = files.length;
      summary.inserted = Number(result.inserted) || 0;
      summary.deleted = Number(result.deleted) || 0;
    } finally {
      await fs.rm(workDir, { recursive: true, force: true });
    }
  }
  for (const file of files) {
    try {
      await archiveDriveFile({ drive, file, uploadsFolder, archiveFolder });
      summary.archived += 1;
    } catch (error) {
      summary.cleanupErrors.push({ fileId: file.id, message: error.message });
      console.error(
        `[OLGATORG Import] Imported file ${file.id} retained: ${error.message}`,
      );
    }
  }
  return summary;
}
