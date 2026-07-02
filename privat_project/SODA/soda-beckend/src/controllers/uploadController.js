import { importSalesService } from '../services/importSalesService.js';

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
  }
};
