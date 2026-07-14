import { pool } from '../db/connectNeon.js';

export const findAllPrices = async () => {
  const result = await pool.query(`
    SELECT
      p.id,
      p.tm,
      p.supplier,
      p.product_name,
      p.price,
      p.price_type_id,
      pt.name AS price_type_name
    FROM prices p
    LEFT JOIN price_types pt
      ON pt.id = p.price_type_id
    ORDER BY p.product_name
  `);

  return result.rows;
};

export const findPriceByProductName = async (productName) => {
  const result = await pool.query(
    `
    SELECT
      p.id,
      p.tm,
      p.supplier,
      p.product_name,
      p.price,
      p.price_type_id,
      pt.name AS price_type_name
    FROM prices p
    LEFT JOIN price_types pt
      ON pt.id = p.price_type_id
    WHERE LOWER(p.product_name) = LOWER($1)
    ORDER BY p.price_type_id
    `,
    [productName],
  );

  return result.rows;
};

export const deleteAllPrices = async () => {
  await pool.query(`
    TRUNCATE TABLE prices RESTART IDENTITY
  `);
};

export const getPricesCount = async () => {
  const result = await pool.query(`
    SELECT COUNT(*)::INT AS total
    FROM prices
  `);

  return result.rows[0].total;
};
