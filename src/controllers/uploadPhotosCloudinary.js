import { uploadToCloudinary } from '../services/cloudinary.js';
import { saveCloudinaryAsset } from '../models/cloudinaryAssetModel.js';

export const uploadPhoto = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Фото не завантажене',
      });
    }

    const result = await uploadToCloudinary(req.file);

    const savedAsset = await saveCloudinaryAsset({
      publicId: result.public_id,
      secureUrl: result.secure_url,
      originalFilename: req.file.originalname,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
    });

    res.json({
      success: true,
      imageUrl: result.secure_url,
      publicId: result.public_id,
      asset: savedAsset,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: 'Помилка завантаження',
    });
  }
};
