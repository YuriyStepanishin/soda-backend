import { processLaskaGoogleDriveImports } from '../services/laskaProcessGoogleDriveImports.js';

export const runLaskaImport = async (req, res) => {
  try {
    const summary = await processLaskaGoogleDriveImports();

    return res.json({
      success: true,
      message: 'LASKA import completed',
      summary,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
