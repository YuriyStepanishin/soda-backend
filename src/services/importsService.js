import { pool } from '../db/connectNeon.js';

export const isFileImported = async (fileName) => {
  const result = await pool.query(
    `
    SELECT id
    FROM imports
    WHERE file_name = $1
    `,
    [fileName],
  );

  return result.rows.length > 0;
};

export const markFileAsImported = async (fileName) => {
  await pool.query(
    `
    INSERT INTO imports (file_name)
    VALUES ($1)
    `,
    [fileName],
  );
};
