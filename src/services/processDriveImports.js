import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pipeline } from 'node:stream/promises';
import { drive } from '../config/googleDrive.js';
import {
  createSyncRecord,
  createSyncRecords,
  getExpiredSyncRecords,
  getSyncRecords,
} from '../models/olgatorgSyncModel.js';

const uploadsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../uploads',
);
const runningImports = new Set();

const folderId = (envName) => {
  const value = process.env[envName];
  if (!value) throw new Error(`${envName} is not configured`);
  return value;
};

const listExcelFiles = async (uploadsFolderEnv, archiveFolderEnv) => {
  const uploadsFolder = folderId(uploadsFolderEnv);
  const archiveFolder = folderId(archiveFolderEnv);
  const files = [];
  let pageToken;

  do {
    const response = await drive.files.list({
      q: `('${uploadsFolder}' in parents or '${archiveFolder}' in parents) and trashed=false`,
      fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,parents)',
      orderBy: 'modifiedTime',
      pageSize: 1000,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    files.push(...(response.data.files || []));
    pageToken = response.data.nextPageToken;
  } while (pageToken);

  return files.filter((file) => /\.(xlsx|xls)$/i.test(file.name || ''));
};

const downloadFile = async (fileId, fileName, prefix) => {
  await fs.promises.mkdir(uploadsDir, { recursive: true });
  const safeName = path.basename(fileName);
  const filePath = path.join(uploadsDir, `${prefix}-${fileId}-${safeName}`);
  const response = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' },
  );

  await pipeline(response.data, fs.createWriteStream(filePath));

  return filePath;
};

const moveToArchive = async (
  fileId,
  parents,
  uploadsFolderEnv,
  archiveFolderEnv,
) => {
  if (!parents?.includes(folderId(uploadsFolderEnv))) return false;

  await drive.files.update({
    fileId,
    addParents: folderId(archiveFolderEnv),
    removeParents: folderId(uploadsFolderEnv),
    supportsAllDrives: true,
  });

  return true;
};

export const processDriveImports = async ({
  key,
  tenant = 'olgatorg',
  fileType,
  prefix,
  uploadsFolderEnv,
  archiveFolderEnv,
  importService,
  importAllFilesWhenChanged = false,
}) => {
  if (runningImports.has(key)) {
    throw new Error(`${key} import is already running`);
  }

  runningImports.add(key);

  try {
    const files = await listExcelFiles(uploadsFolderEnv, archiveFolderEnv);
    const summary = {
      found: files.length,
      processed: 0,
      archived: 0,
      inserted: 0,
      deleted: 0,
      trashedFromArchive: 0,
    };
    const syncRecords = new Map(
      (await getSyncRecords(fileType, tenant)).map((record) => [
        record.file_id,
        record,
      ]),
    );
    const changedFiles = [];
    for (const file of files) {
      const syncRecord = syncRecords.get(file.id);
      const storedModifiedTime = syncRecord?.modified_time
        ? new Date(syncRecord.modified_time).getTime()
        : null;
      const currentModifiedTime = file.modifiedTime
        ? new Date(file.modifiedTime).getTime()
        : null;

      if (
        syncRecord &&
        storedModifiedTime === null &&
        currentModifiedTime !== null
      ) {
        await createSyncRecord({
          tenant,
          fileType,
          fileName: syncRecord.file_name,
          fileId: file.id,
          importedRows: syncRecord.imported_rows,
          modifiedTime: file.modifiedTime,
        });
        continue;
      }

      if (
        syncRecord &&
        (currentModifiedTime === null ||
          storedModifiedTime === currentModifiedTime)
      ) {
        continue;
      }

      changedFiles.push(file);
    }

    const filesToImport =
      importAllFilesWhenChanged && changedFiles.length ? files : changedFiles;
    const downloadedFiles = [];
    try {
      for (const file of filesToImport) {
        const filePath = await downloadFile(file.id, file.name, prefix);
        downloadedFiles.push({ ...file, filePath });
      }

      if (downloadedFiles.length) {
        const result = await importService(downloadedFiles);
        const rowsByFile = result?.rowsByFile || {};
        summary.processed = downloadedFiles.length;
        summary.inserted = Number(result?.inserted) || 0;
        summary.deleted = Number(result?.deleted) || 0;

        await createSyncRecords({
          tenant,
          fileType,
          files: downloadedFiles.map((file) => ({
            fileName: file.name,
            fileId: file.id,
            importedRows:
              Number(rowsByFile[file.id] ?? rowsByFile[file.name]) || 0,
            modifiedTime: file.modifiedTime,
          })),
        });
      }
    } finally {
      for (const file of downloadedFiles) {
        await fs.promises.unlink(file.filePath).catch(() => {});
      }
    }

    for (const file of files) {
      if (!file.parents?.includes(folderId(uploadsFolderEnv))) continue;
      if (
        await moveToArchive(
          file.id,
          file.parents,
          uploadsFolderEnv,
          archiveFolderEnv,
        )
      ) {
        summary.archived += 1;
      }
    }

    const archiveFolder = folderId(archiveFolderEnv);
    const uploadsFolder = folderId(uploadsFolderEnv);
    const filesById = new Map(files.map((file) => [file.id, file]));
    const expiredRecords = await getExpiredSyncRecords({
      fileType,
      tenant,
    });

    for (const record of expiredRecords) {
      const file = filesById.get(record.file_id);
      const storedModifiedTime = new Date(record.modified_time).getTime();
      const currentModifiedTime = file?.modifiedTime
        ? new Date(file.modifiedTime).getTime()
        : null;

      if (
        !file ||
        !file.parents?.includes(archiveFolder) ||
        file.parents.includes(uploadsFolder) ||
        currentModifiedTime === null ||
        storedModifiedTime !== currentModifiedTime
      ) {
        continue;
      }

      await drive.files.update({
        fileId: file.id,
        requestBody: { trashed: true },
        supportsAllDrives: true,
      });
      summary.trashedFromArchive += 1;
    }

    return summary;
  } finally {
    runningImports.delete(key);
  }
};
