import fs from 'node:fs/promises';
import { importSalesService } from '../services/olgatorgImportSalesService.js';

export const uploadSales = async (req, res) => {
  try {
    const inserted = await importSalesService(req.file.path);

    return res.json({
      success: true,
      inserted,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  } finally {
    if (req.file?.path) {
      await fs.unlink(req.file.path).catch(() => {});
    }
  }
};
