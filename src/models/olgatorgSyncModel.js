import { getPool } from '../db/index.js';

const getSyncPool = (tenant = 'olgatorg') => getPool(tenant);

const ensureSyncHistory = async (pool) => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sync_history (
      id SERIAL PRIMARY KEY,
      file_type TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_id TEXT NOT NULL,
      imported_rows INTEGER NOT NULL DEFAULT 0,
      imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_history_file_type_file_id
      ON sync_history (file_type, file_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_sync_history_imported_at
      ON sync_history (file_type, imported_at DESC)
  `);
};

export const createSyncRecord = async ({
  tenant = 'olgatorg',
  fileType,
  fileName,
  fileId,
  importedRows,
}) => {
  const pool = getSyncPool(tenant);
  await ensureSyncHistory(pool);

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

export const getLastSync = async (fileType, tenant = 'olgatorg') => {
  const pool = getSyncPool(tenant);
  await ensureSyncHistory(pool);

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

export const getSyncByFileId = async (
  fileType,
  fileId,
  tenant = 'olgatorg',
) => {
  const pool = getSyncPool(tenant);
  await ensureSyncHistory(pool);

  const result = await pool.query(
    `
    SELECT *
    FROM sync_history
    WHERE file_type = $1 AND file_id = $2
    LIMIT 1
    `,
    [fileType, fileId],
  );

  return result.rows[0];
};
