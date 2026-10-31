import fs from 'node:fs/promises';
import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

// Each LASKA workbook is a complete snapshot of the dates it contains.
// Process oldest first so a newer snapshot replaces, rather than duplicates, it.
export async function runLaskaDriveImports({
  drive, uploadsFolder, importService, getRecords, saveRecord, tempRoot,
}) {
  if (!uploadsFolder) throw new Error('LASKA_UPLOADS_FOLDER_ID is not configured');
  const files = [];
  let pageToken;
  do {
    const response = await drive.files.list({
      q: `'${uploadsFolder}' in parents and trashed=false`,
      fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,parents)',
      orderBy: 'modifiedTime', pageSize: 1000, pageToken,
      supportsAllDrives: true, includeItemsFromAllDrives: true,
    });
    files.push(...(response.data.files || []).filter(file => /\.(xlsx|xls)$/i.test(file.name || '')));
    pageToken = response.data.nextPageToken;
  } while (pageToken);

  const records = new Map((await getRecords()).map(record => [record.file_id, record]));
  const summary = { found: files.length, processed: 0, inserted: 0, deleted: 0, trashed: 0, cleanupErrors: [] };
  for (const file of files) {
    const record = records.get(file.id);
    const sameVersion = Number(record?.imported_rows) > 0 && record?.modified_time && file.modifiedTime &&
      new Date(record.modified_time).getTime() === new Date(file.modifiedTime).getTime();
    if (!sameVersion) {
      await fs.mkdir(tempRoot, { recursive: true });
      const workDir = await fs.mkdtemp(path.join(tempRoot, 'laska-'));
      const filePath = path.join(workDir, path.basename(file.name));
      try {
        const response = await drive.files.get(
          { fileId: file.id, alt: 'media', supportsAllDrives: true },
          { responseType: 'stream' },
        );
        await pipeline(response.data, createWriteStream(filePath));
        console.log(`[LASKA Import] Importing ${file.name} (${file.id})`);
        const result = await importService([{ ...file, filePath }]);
        const importedRows = Number(result?.rowsByFile?.[file.id]);
        if (!Number.isInteger(importedRows) || importedRows <= 0) {
          throw new Error(`${file.name}: no imported rows; source file retained`);
        }
        // importService returns only after COMMIT. Persist the original version
        // before touching Drive, so a cleanup retry never repeats the import.
        await saveRecord({ fileName: file.name, fileId: file.id, importedRows, modifiedTime: file.modifiedTime });
        summary.processed += 1;
        summary.inserted += Number(result.inserted) || 0;
        summary.deleted += Number(result.deleted) || 0;
      } finally {
        await fs.rm(workDir, { recursive: true, force: true });
      }
    }

    try {
      const current = await drive.files.get({
        fileId: file.id, fields: 'id,modifiedTime,parents,trashed,capabilities(canTrash)', supportsAllDrives: true,
      });
      if (current.data.trashed) continue;
      if (!file.modifiedTime || current.data.modifiedTime !== file.modifiedTime ||
          !current.data.parents?.includes(uploadsFolder)) {
        summary.cleanupErrors.push({ fileId: file.id, message: 'File changed or moved after listing; retained' });
        continue;
      }
      if (!current.data.capabilities?.canTrash) {
        throw new Error('Drive account cannot trash this file; authenticate as its owner');
      }
      await drive.files.update({ fileId: file.id, requestBody: { trashed: true }, supportsAllDrives: true });
      summary.trashed += 1;
    } catch (error) {
      summary.cleanupErrors.push({ fileId: file.id, message: error.message });
      console.error(`[LASKA Import] Imported file ${file.id} retained: ${error.message}`);
    }
  }
  return summary;
}
