import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');
const uploadsDir = path.join(projectRoot, 'uploads');
const serviceAccountPath = path.join(
  projectRoot,
  'google-service-account.json',
);

const auth = new google.auth.GoogleAuth({
  keyFile: serviceAccountPath,
  scopes: ['https://www.googleapis.com/auth/drive'],
});

const drive = google.drive({
  version: 'v3',
  auth,
});

export async function getExcelFiles() {
  if (!process.env.UPLOADS_FOLDER_ID) {
    throw new Error('UPLOADS_FOLDER_ID is not configured');
  }

  const response = await drive.files.list({
    q: `'${process.env.UPLOADS_FOLDER_ID}' in parents and trashed=false`,
    fields: 'files(id,name,mimeType)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  return (response.data.files || []).filter((file) => {
    const name = (file.name || '').toLowerCase();

    return name.endsWith('.xls') || name.endsWith('.xlsx');
  });
}

export async function downloadFile(fileId, fileName) {
  await fs.promises.mkdir(uploadsDir, { recursive: true });

  const filePath = path.join(uploadsDir, fileName);

  const response = await drive.files.get(
    {
      fileId,
      alt: 'media',
      supportsAllDrives: true,
    },
    {
      responseType: 'stream',
    },
  );

  await new Promise((resolve, reject) => {
    const dest = fs.createWriteStream(filePath);

    response.data.pipe(dest).on('finish', resolve).on('error', reject);
  });

  return filePath;
}

export async function moveToArchive(fileId) {
  if (!process.env.ARCHIVE_FOLDER_ID) {
    throw new Error('ARCHIVE_FOLDER_ID is not configured');
  }

  await drive.files.update({
    fileId,
    addParents: process.env.ARCHIVE_FOLDER_ID,
    removeParents: process.env.UPLOADS_FOLDER_ID,
    supportsAllDrives: true,
  });
}
