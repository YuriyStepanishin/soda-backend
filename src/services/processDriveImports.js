import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { drive } from '../config/googleDrive.js';
import { createSyncRecord, getSyncByFileId } from '../models/olgatorgSyncModel.js';

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

const listExcelFiles = async (uploadsFolderEnv) => {
  const response = await drive.files.list({
    q: `'${folderId(uploadsFolderEnv)}' in parents and trashed=false`,
    fields: 'files(id,name,mimeType,modifiedTime)',
    orderBy: 'modifiedTime',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  return (response.data.files || []).filter((file) =>
    /\.(xlsx|xls)$/i.test(file.name || ''),
  );
};

const downloadFile = async (fileId, fileName, prefix) => {
  await fs.promises.mkdir(uploadsDir, { recursive: true });
  const safeName = path.basename(fileName);
  const filePath = path.join(uploadsDir, `${prefix}-${fileId}-${safeName}`);
  const response = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' },
  );

  await new Promise((resolve, reject) => {
    const destination = fs.createWriteStream(filePath);
    response.data.pipe(destination).on('finish', resolve).on('error', reject);
  });

  return filePath;
};

const moveToArchive = async (fileId, uploadsFolderEnv, archiveFolderEnv) => {
  await drive.files.update({
    fileId,
    addParents: folderId(archiveFolderEnv),
    removeParents: folderId(uploadsFolderEnv),
    supportsAllDrives: true,
  });
};

const countsFrom = (result) =>
  typeof result === 'number'
    ? { inserted: result, updated: 0 }
    : {
        inserted: Number(result?.inserted) || 0,
        updated: Number(result?.updated) || 0,
      };

export const processDriveImports = async ({
  key,
  fileType,
  prefix,
  uploadsFolderEnv,
  archiveFolderEnv,
  importService,
}) => {
  if (runningImports.has(key)) {
    throw new Error(`${key} import is already running`);
  }

  runningImports.add(key);

  try {
    const files = await listExcelFiles(uploadsFolderEnv);
    const summary = { found: files.length, processed: 0, archived: 0, inserted: 0, updated: 0, failed: [] };

    for (const file of files) {
      let filePath;

      try {
        if (await getSyncByFileId(fileType, file.id)) {
          await moveToArchive(file.id, uploadsFolderEnv, archiveFolderEnv);
          summary.archived += 1;
          continue;
        }

        filePath = await downloadFile(file.id, file.name, prefix);
        const counts = countsFrom(await importService(filePath));

        await createSyncRecord({
          fileType,
          fileName: file.name,
          fileId: file.id,
          importedRows: counts.inserted + counts.updated,
        });
        await moveToArchive(file.id, uploadsFolderEnv, archiveFolderEnv);

        summary.processed += 1;
        summary.archived += 1;
        summary.inserted += counts.inserted;
        summary.updated += counts.updated;
      } catch (error) {
        summary.failed.push({ fileId: file.id, fileName: file.name, error: error.message });
      } finally {
        if (filePath) await fs.promises.unlink(filePath).catch(() => {});
      }
    }

    if (summary.failed.length) {
      const details = summary.failed.map((item) => `${item.fileName}: ${item.error}`).join('; ');
      throw new Error(`${key} import finished with errors: ${details}`);
    }

    return summary;
  } finally {
    runningImports.delete(key);
  }
};
