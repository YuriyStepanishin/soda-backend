import {
  getExcelFiles,
  downloadFile,
  moveToArchive,
} from './googleDriveService.js';

import { importSalesService } from './importSalesService.js';
import { createSyncRecord } from '../models/syncModel.js';

export const processGoogleDriveImports = async () => {
  const files = await getExcelFiles();
  const summary = {
    found: files.length,
    processed: 0,
    archived: 0,
    failed: [],
  };

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
      summary.processed += 1;
      summary.archived += 1;

      console.log(`Archived: ${file.name}`);
    } catch (error) {
      console.error(`Error processing ${file.name}:`, error.message);
      summary.failed.push({
        fileId: file.id,
        fileName: file.name,
        error: error.message,
      });
    }
  }

  if (summary.failed.length > 0) {
    const failedNames = summary.failed.map((item) => item.fileName).join(', ');

    throw new Error(
      `Import finished with errors. Failed files: ${failedNames}`,
    );
  }

  return summary;
};
