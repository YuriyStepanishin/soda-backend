import { importLaskaSales } from './laskaImportSalesService.js';
import { processDriveImports } from './processDriveImports.js';

export const processLaskaGoogleDriveImports = async () => {
  return processDriveImports({
    key: 'LASKA',
    tenant: 'laska',
    fileType: 'laska-sales',
    prefix: 'laska',
    uploadsFolderEnv: 'LASKA_UPLOADS_FOLDER_ID',
    archiveFolderEnv: 'LASKA_ARCHIVE_FOLDER_ID',
    importService: importLaskaSales,
  });
};
