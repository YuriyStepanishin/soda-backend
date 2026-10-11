import { createImportController } from '../modules/imports/import.controller.js';
import { createImportRouter } from '../modules/imports/import.routes.js';
import { processLaskaGoogleDriveImports } from '../services/laskaProcessGoogleDriveImports.js';

const runLaskaImport = createImportController({
  runImport: processLaskaGoogleDriveImports,
  successMessage: 'LASKA import completed',
});

export default createImportRouter({ method: 'post', handler: runLaskaImport });
