import XLSX from 'xlsx';
import { pool } from '../db/connectNeon.js';

export const uploadPricesService = async (filePath) => {
  const workbook = XLSX.readFile(filePath);

  const priceSheet = workbook.Sheets[workbook.SheetNames[0]];

  const rows = XLSX.utils.sheet_to_json(priceSheet);

  const normalizedRows = rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key.trim(), value]),
    ),
  );

  let updated = 0;

  for (const row of normalizedRows) {
    await pool.query(
      `
      INSERT INTO prices (
        product_name,
        retail_price,
        bpl_price,
        bpl5_price,
        bpl8_price
      )
      VALUES ($1,$2,$3,$4,$5)

      ON CONFLICT (product_name)
      DO UPDATE SET
        retail_price = EXCLUDED.retail_price,
        bpl_price = EXCLUDED.bpl_price,
        bpl5_price = EXCLUDED.bpl5_price,
        bpl8_price = EXCLUDED.bpl8_price
      `,
      [
        row['товар'],
        Number(row['ціна']) || 0,
        Number(row['БПЛ']) || 0,
        Number(row['БПЛ-5%']) || 0,
        Number(row['БПЛ-8%']) || 0,
      ],
    );

    updated++;
  }

  return updated;
};
