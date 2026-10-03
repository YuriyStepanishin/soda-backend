import { importLaskaSales } from '../services/laskaImportSalesService.js';

export const uploadLaskaSales = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'Excel file is required',
    });
  }

  try {
    const result = await importLaskaSales(req.file.path);

    return res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
