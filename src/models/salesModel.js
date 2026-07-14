import { pool } from '../db/connectNeon.js';

const SALES_INSERT_QUERY = `
  INSERT INTO sales (
    sale_date,
    tm,
    product_name,
    barcode,
    weight,
    qty,
    amount,
    client_code,
    client_name,
    address,
    outlet_name,
    outlet_code,
    agent_name,
    month,
    volume,
    outlet_type,
    supervisor_name,
    price,
    discount,
    alt_name,
    price_type
  )
  VALUES (
    $1,$2,$3,$4,$5,
    $6,$7,$8,$9,$10,
    $11,$12,$13,$14,$15,
    $16,$17,$18,$19,$20,$21
  )
`;

const getSalesValues = (row) => [
  row.sale_date,
  row.tm,
  row.product_name,
  row.barcode,
  row.weight,
  row.qty,
  row.amount,
  row.client_code,
  row.client_name,
  row.address,
  row.outlet_name,
  row.outlet_code,
  row.agent_name,
  row.month,
  row.volume,
  row.outlet_type,
  row.supervisor_name,
  row.price,
  row.discount,
  row.alt_name,
  row.price_type,
];

export const findAllSales = async (filter, { page, limit }) => {
  const offset = (page - 1) * limit;

  const result = await pool.query(
    `
    SELECT *
    FROM sales
    ${filter.where}
  ORDER BY sale_date DESC, id DESC
    LIMIT $${filter.params.length + 1}
    OFFSET $${filter.params.length + 2}
    `,
    [...filter.params, limit, offset],
  );

  return result.rows;
};

export const getSalesMeta = async (filter) => {
  const result = await pool.query(
    `
    SELECT DISTINCT tm, agent_name, supervisor_name
    FROM sales
    ${filter.where}
    `,
    filter.params,
  );

  return {
    tm: result.rows.map((row) => row.tm),
    agent_name: result.rows.map((row) => row.agent_name),
    supervisor_name: result.rows.map((row) => row.supervisor_name),
  };
};

export const countSales = async (filter) => {
  const result = await pool.query(
    `
    SELECT COUNT(*)::INT AS total
    FROM sales
    ${filter.where}
    `,
    filter.params,
  );

  return result.rows[0].total;
};

export const findSaleById = async (id) => {
  const result = await pool.query(
    `
    SELECT *
    FROM sales
    WHERE id = $1
    `,
    [id],
  );

  return result.rows[0];
};

export const getSalesByPeriod = async (dateFrom, dateTo) => {
  const result = await pool.query(
    `
    SELECT *
    FROM sales
    WHERE sale_date BETWEEN $1 AND $2
    ORDER BY sale_date DESC, id DESC
    `,
    [dateFrom, dateTo],
  );

  return result.rows;
};

export const deleteAllSales = async () => {
  await pool.query('TRUNCATE TABLE sales RESTART IDENTITY');
};

export const getSalesCount = async () => {
  const result = await pool.query(`
    SELECT COUNT(*)::INT AS total
    FROM sales
  `);

  return result.rows[0].total;
};

export const insertSalesBatch = async (rows) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const row of rows) {
      await client.query(SALES_INSERT_QUERY, getSalesValues(row));
    }

    await client.query('COMMIT');

    return rows.length;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const replaceAllSales = async (rows) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query('TRUNCATE TABLE sales RESTART IDENTITY');

    for (const row of rows) {
      await client.query(SALES_INSERT_QUERY, getSalesValues(row));
    }

    await client.query('COMMIT');

    return rows.length;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
