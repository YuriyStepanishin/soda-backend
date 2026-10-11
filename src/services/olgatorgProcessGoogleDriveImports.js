import { importSalesService } from './olgatorgImportSalesService.js';
import { processDriveImports } from './processDriveImports.js';

export const processGoogleDriveImports = async () => {
  return processDriveImports({
    key: 'OLGATORG',
    tenant: 'olgatorg',
    fileType: 'sales',
    prefix: 'olgatorg',
    uploadsFolderEnv: 'UPLOADS_FOLDER_ID',
    archiveFolderEnv: 'ARCHIVE_FOLDER_ID',
    importService: importSalesService,
  });
};
