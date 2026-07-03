import { pool } from '../db/connectNeon.js';

export const findAllPrices = async () => {
  const result = await pool.query(`
    SELECT *
    FROM prices
    ORDER BY product_name
  `);

  return result.rows;
};

export const findPriceByProductName = async (productName) => {
  const result = await pool.query(
    `
    SELECT *
    FROM prices
    WHERE LOWER(product_name) = LOWER($1)
    LIMIT 1
    `,
    [productName],
  );

  return result.rows[0];
};

export const deleteAllPrices = async () => {
  await pool.query('TRUNCATE TABLE prices RESTART IDENTITY');
};

export const getPricesCount = async () => {
  const result = await pool.query(`
    SELECT COUNT(*)::INT AS total
    FROM prices
  `);

  return result.rows[0].total;
};
