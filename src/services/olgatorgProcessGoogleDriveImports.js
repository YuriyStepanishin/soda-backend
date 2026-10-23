import { importOlgatorgSales } from './olgatorgSalesImportService.js';
import { processDriveImports } from './processDriveImports.js';

export const processGoogleDriveImports = async () =>
  processDriveImports({
    key: 'OLGATORG',
    tenant: 'olgatorg',
    fileType: 'sales',
    prefix: 'olgatorg',
    uploadsFolderEnv: 'UPLOADS_FOLDER_ID',
    archiveFolderEnv: 'ARCHIVE_FOLDER_ID',
    importService: importOlgatorgSales,
    importAllFilesWhenChanged: true,
  });
