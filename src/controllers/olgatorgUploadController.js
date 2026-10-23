import fs from 'node:fs/promises';
import { importOlgatorgSales } from '../services/olgatorgSalesImportService.js';

export const uploadSales = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'Excel file is required',
    });
  }

  try {
    const result = await importOlgatorgSales([
      { filePath: req.file.path, name: req.file.originalname },
    ]);
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  } finally {
    if (req.file?.path) {
      try {
        await fs.unlink(req.file.path);
      } catch (error) {
        console.error('Failed to remove rejected OLGATORG upload:', error.message);
      }
    }
  }
};
