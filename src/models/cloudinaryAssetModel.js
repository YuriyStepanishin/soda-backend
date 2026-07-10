import { pool } from '../db/connectNeon.js';

let tableReady = false;

const ensureCloudinaryAssetsTable = async () => {
  if (tableReady) {
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS cloudinary_assets (
      id SERIAL PRIMARY KEY,
      public_id TEXT UNIQUE NOT NULL,
      secure_url TEXT NOT NULL,
      original_filename TEXT,
      mime_type TEXT,
      size_bytes INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  tableReady = true;
};

export const saveCloudinaryAsset = async ({
  publicId,
  secureUrl,
  originalFilename,
  mimeType,
  sizeBytes,
}) => {
  await ensureCloudinaryAssetsTable();

  const result = await pool.query(
    `
    INSERT INTO cloudinary_assets (
      public_id,
      secure_url,
      original_filename,
      mime_type,
      size_bytes
    )
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (public_id)
    DO UPDATE SET
      secure_url = EXCLUDED.secure_url,
      original_filename = EXCLUDED.original_filename,
      mime_type = EXCLUDED.mime_type,
      size_bytes = EXCLUDED.size_bytes
    RETURNING *
    `,
    [publicId, secureUrl, originalFilename, mimeType, sizeBytes],
  );

  return result.rows[0];
};
