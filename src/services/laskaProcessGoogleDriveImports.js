import { importLaskaSales } from './laskaImportSalesService.js';
import { drive } from '../config/googleDrive.js';
import { getSyncRecords, createSyncRecord } from '../models/olgatorgSyncModel.js';
import { runLaskaDriveImports } from './laskaDriveImportRunner.js';
import { fileURLToPath } from 'node:url';

let running = false;

export const processLaskaGoogleDriveImports = async () => {
  if (running) throw new Error('LASKA import is already running');
  running = true;
  try {
    return await runLaskaDriveImports({
      drive,
      uploadsFolder: process.env.LASKA_UPLOADS_FOLDER_ID,
      importService: importLaskaSales,
      getRecords: () => getSyncRecords('laska-sales', 'laska'),
      saveRecord: record => createSyncRecord({ ...record, tenant: 'laska', fileType: 'laska-sales' }),
      tempRoot: fileURLToPath(new URL('../../uploads/', import.meta.url)),
    });
  } finally {
    running = false;
  }
};
