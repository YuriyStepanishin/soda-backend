import { uploadPricesService } from '../services/uploadPricesService.js';

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
  }
};
