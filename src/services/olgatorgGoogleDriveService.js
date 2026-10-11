import { drive } from '../config/googleDrive.js';

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
