import { getPool } from '../db/index.js';

const getSyncPool = (tenant = 'olgatorg') => getPool(tenant);

export const ensureSyncHistory = async (pool) => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sync_history (
      id SERIAL PRIMARY KEY,
      file_type TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_id TEXT NOT NULL,
      imported_rows INTEGER NOT NULL DEFAULT 0,
      modified_time TIMESTAMPTZ,
      imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE sync_history
      ADD COLUMN IF NOT EXISTS modified_time TIMESTAMPTZ
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
  modifiedTime,
}) => {
  const pool = getSyncPool(tenant);
  await ensureSyncHistory(pool);

  const result = await pool.query(
    `
    INSERT INTO sync_history (
      file_type,
      file_name,
      file_id,
      imported_rows,
      modified_time
    )
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (file_type, file_id) DO UPDATE SET
      file_name = EXCLUDED.file_name,
      imported_rows = EXCLUDED.imported_rows,
      modified_time = EXCLUDED.modified_time,
      imported_at = NOW()
    RETURNING *
    `,
    [fileType, fileName, fileId, importedRows, modifiedTime || null],
  );

  return result.rows[0];
};

export const createSyncRecords = async ({
  tenant = 'olgatorg',
  fileType,
  files,
}) => {
  if (!files.length) return;
  const pool = getSyncPool(tenant);
  await ensureSyncHistory(pool);

  const values = [];
  const rows = files.map((file, index) => {
    const offset = index * 5;
    values.push(
      fileType,
      file.fileName,
      file.fileId,
      file.importedRows,
      file.modifiedTime || null,
    );
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`;
  });

  await pool.query(
    `
    INSERT INTO sync_history (
      file_type, file_name, file_id, imported_rows, modified_time
    )
    VALUES ${rows.join(', ')}
    ON CONFLICT (file_type, file_id) DO UPDATE SET
      file_name = EXCLUDED.file_name,
      imported_rows = EXCLUDED.imported_rows,
      modified_time = EXCLUDED.modified_time,
      imported_at = NOW()
    `,
    values,
  );
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

export const getSyncRecords = async (fileType, tenant = 'olgatorg') => {
  const pool = getSyncPool(tenant);
  await ensureSyncHistory(pool);

  const result = await pool.query(
    'SELECT * FROM sync_history WHERE file_type = $1',
    [fileType],
  );
  return result.rows;
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

export const getExpiredSyncRecords = async ({
  fileType,
  tenant = 'olgatorg',
  retentionDays = 10,
}) => {
  const pool = getSyncPool(tenant);
  await ensureSyncHistory(pool);

  const result = await pool.query(
    `
    SELECT file_id, modified_time
    FROM sync_history
    WHERE file_type = $1
      AND imported_at < NOW() - ($2 * INTERVAL '1 day')
      AND modified_time IS NOT NULL
    `,
    [fileType, retentionDays],
  );

  return result.rows;
};
