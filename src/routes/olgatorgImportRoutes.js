import { createImportController } from '../modules/imports/import.controller.js';
import { createImportRouter } from '../modules/imports/import.routes.js';
import { processGoogleDriveImports } from '../services/olgatorgProcessGoogleDriveImports.js';

const runImport = createImportController({
  runImport: processGoogleDriveImports,
  successMessage: 'Import completed',
});

export default createImportRouter({ method: 'get', handler: runImport });
