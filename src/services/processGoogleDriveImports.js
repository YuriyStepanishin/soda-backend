import {
  getExcelFiles,
  downloadFile,
  moveToArchive,
} from './googleDriveService.js';

import { importSalesService } from './importSalesService.js';
import { createSyncRecord } from '../models/syncModel.js';

export const processGoogleDriveImports = async () => {
  const files = await getExcelFiles();

  console.log(`Found ${files.length} files`);

  for (const file of files) {
    try {
      console.log(`Processing: ${file.name}`);

      const filePath = await downloadFile(file.id, file.name);

      console.log(`Downloaded: ${file.name}`);

      const inserted = await importSalesService(filePath);

      console.log(`Imported ${inserted} rows from ${file.name}`);

      await createSyncRecord({
        fileType: 'sales',
        fileName: file.name,
        fileId: file.id,
        importedRows: inserted,
      });

      await moveToArchive(file.id);

      console.log(`Archived: ${file.name}`);
    } catch (error) {
      console.error(`Error processing ${file.name}:`, error.message);
    }
  }
};
