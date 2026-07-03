import { processGoogleDriveImports } from '../services/processGoogleDriveImports.js';

export const runImport = async (req, res) => {
  try {
    await processGoogleDriveImports();

    res.json({
      success: true,
      message: 'Import completed',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
