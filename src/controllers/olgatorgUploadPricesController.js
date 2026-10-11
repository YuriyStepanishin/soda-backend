import fs from 'node:fs/promises';
import { uploadPricesService } from '../services/olgatorgUploadPricesService.js';

export const uploadPrices = async (req, res) => {
  try {
    const updated = await uploadPricesService(req.file.path);

    return res.json({
      success: true,
      updated,
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
