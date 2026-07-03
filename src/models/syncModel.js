import { pool } from '../db/connectNeon.js';

export const createSyncRecord = async ({
  fileType,
  fileName,
  fileId,
  importedRows,
}) => {
  const result = await pool.query(
    `
    INSERT INTO sync_history (
      file_type,
      file_name,
      file_id,
      imported_rows
    )
    VALUES ($1, $2, $3, $4)
    RETURNING *
    `,
    [fileType, fileName, fileId, importedRows],
  );

  return result.rows[0];
};

export const getLastSync = async (fileType) => {
  const result = await pool.query(
    `
    SELECT *
    FROM sync_history
    WHERE file_type = $1
    ORDER BY imported_at DESC
    LIMIT 1
    `,
    [fileType],
  );

  return result.rows[0];
};
