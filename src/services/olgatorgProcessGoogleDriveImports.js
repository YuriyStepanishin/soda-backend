import fs from 'fs';
import {
  getExcelFiles,
  downloadFile,
  moveToArchive,
} from './olgatorgGoogleDriveService.js';
import { importSalesService } from './olgatorgImportSalesService.js';
import { createSyncRecord } from '../models/olgatorgSyncModel.js';
import { processDriveImports } from './processDriveImports.js';

let isOlgatorgImportRunning = false;

const processSalesFile = async (file) => {
  console.log(`Processing: ${file.name}`);

  const filePath = await downloadFile(file.id, file.name);

  try {
    console.log(`Downloaded: ${file.name}`);

    const importedRows = await importSalesService(filePath);
    console.log(`Imported ${importedRows} rows from ${file.name}`);

    await createSyncRecord({
      fileType: 'sales',
      fileName: file.name,
      fileId: file.id,
      importedRows,
    });

    await moveToArchive(file.id);
    console.log(`Archived: ${file.name}`);

    return importedRows;
  } finally {
    await fs.promises.unlink(filePath).catch(() => {});
  }
};

const processGoogleDriveImportsInternal = async () => {
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
      await processSalesFile(file);
      summary.processed += 1;
      summary.archived += 1;
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

export const processGoogleDriveImports = async () => {
  return processDriveImports({
    key: 'OLGATORG',
    fileType: 'sales',
    prefix: 'olgatorg',
    uploadsFolderEnv: 'UPLOADS_FOLDER_ID',
    archiveFolderEnv: 'ARCHIVE_FOLDER_ID',
    importService: importSalesService,
  });
};
