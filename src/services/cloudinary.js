import cloudinary, {
  ensureCloudinaryConfigured,
} from '../config/cloudinary.js';

export const uploadToCloudinary = (file) => {
  ensureCloudinaryConfigured();

  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          folder: process.env.CLOUDINARY_FOLDER || 'soda-reports',
          resource_type: 'image',
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        },
      )
      .end(file.buffer);
  });
};
