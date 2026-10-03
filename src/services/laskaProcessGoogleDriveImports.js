import fs from 'fs';
import {
  downloadLaskaFile,
  getLaskaExcelFiles,
  moveLaskaFileToArchive,
} from './laskaGoogleDriveService.js';
import { importLaskaSales } from './laskaImportSalesService.js';
import { processDriveImports } from './processDriveImports.js';

let isLaskaImportRunning = false;

const processLaskaGoogleDriveImportsInternal = async () => {
  const files = await getLaskaExcelFiles();
  const summary = {
    found: files.length,
    processed: 0,
    archived: 0,
    inserted: 0,
    updated: 0,
    failed: [],
  };

  for (const file of files) {
    let filePath;

    try {
      filePath = await downloadLaskaFile(file.id, file.name);
      const result = await importLaskaSales(filePath);

      await moveLaskaFileToArchive(file.id);
      summary.processed += 1;
      summary.archived += 1;
      summary.inserted += result.inserted;
      summary.updated += result.updated;
    } catch (error) {
      summary.failed.push({
        fileId: file.id,
        fileName: file.name,
        error: error.message,
      });
    } finally {
      if (filePath) {
        await fs.promises.unlink(filePath).catch(() => {});
      }
    }
  }

  if (summary.failed.length > 0) {
    const failedNames = summary.failed.map((item) => item.fileName).join(', ');
    throw new Error(
      `LASKA import finished with errors. Failed files: ${failedNames}`,
    );
  }

  return summary;
};

export const processLaskaGoogleDriveImports = async () => {
  return processDriveImports({
    key: 'LASKA',
    fileType: 'laska-sales',
    prefix: 'laska',
    uploadsFolderEnv: 'LASKA_UPLOADS_FOLDER_ID',
    archiveFolderEnv: 'LASKA_ARCHIVE_FOLDER_ID',
    importService: importLaskaSales,
  });
};
