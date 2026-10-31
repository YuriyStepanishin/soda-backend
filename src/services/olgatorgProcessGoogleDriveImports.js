import { importOlgatorgSales } from './olgatorgSalesImportService.js';
import { drive } from '../config/googleDrive.js';
import { getSyncRecords, createSyncRecords } from '../models/olgatorgSyncModel.js';
import { runOlgatorgDriveImports } from './olgatorgDriveImportRunner.js';
import { fileURLToPath } from 'node:url';

let running = false;
export const processGoogleDriveImports = async () => {
  if (running) throw new Error('OLGATORG import is already running');
  running = true;
  try {
    return await runOlgatorgDriveImports({
      drive, uploadsFolder: process.env.UPLOADS_FOLDER_ID,
      importService: importOlgatorgSales,
      getRecords: () => getSyncRecords('sales', 'olgatorg'),
      saveRecords: files => createSyncRecords({ tenant: 'olgatorg', fileType: 'sales', files }),
      tempRoot: fileURLToPath(new URL('../../uploads/', import.meta.url)),
    });
  } finally {
    running = false;
  }
};
