import { processGoogleDriveImports } from '../services/processGoogleDriveImports.js';

export const runImport = async (req, res) => {
  try {
    const summary = await processGoogleDriveImports();

    res.json({
      success: true,
      message: 'Import completed',
      summary,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
