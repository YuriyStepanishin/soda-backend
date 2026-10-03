import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { drive } from '../config/googleDrive.js';

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const uploadsDir = path.join(projectRoot, 'uploads');

const getFolderId = (name) => {
  const folderId = process.env[name];

  if (!folderId) {
    throw new Error(`${name} is not configured`);
  }

  return folderId;
};

export const getLaskaExcelFiles = async () => {
  const uploadsFolderId = getFolderId('LASKA_UPLOADS_FOLDER_ID');
  const response = await drive.files.list({
    q: `'${uploadsFolderId}' in parents and trashed=false`,
    fields: 'files(id,name,mimeType,modifiedTime)',
    orderBy: 'modifiedTime',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  return (response.data.files || []).filter((file) => {
    const name = (file.name || '').toLowerCase();
    return name.endsWith('.xls') || name.endsWith('.xlsx');
  });
};

export const downloadLaskaFile = async (fileId, fileName) => {
  await fs.promises.mkdir(uploadsDir, { recursive: true });

  const safeFileName = path.basename(fileName);
  const filePath = path.join(uploadsDir, `laska-${fileId}-${safeFileName}`);
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

export const moveLaskaFileToArchive = async (fileId) => {
  const uploadsFolderId = getFolderId('LASKA_UPLOADS_FOLDER_ID');
  const archiveFolderId = getFolderId('LASKA_ARCHIVE_FOLDER_ID');

  await drive.files.update({
    fileId,
    addParents: archiveFolderId,
    removeParents: uploadsFolderId,
    supportsAllDrives: true,
  });
};
