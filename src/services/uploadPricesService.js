import XLSX from 'xlsx';
import { pool } from '../db/connectNeon.js';

const PRICE_TYPES = {
  Роздріб: 1,
  БПЛ: 2,
  'БПЛ-5%': 3,
  'БПЛ-8%': 4,
};

export const uploadPricesService = async (filePath, supplier = 'Орімі') => {
  const workbook = XLSX.readFile(filePath);

  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  const rows = XLSX.utils.sheet_to_json(sheet);

  const normalizedRows = rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key.trim(), value]),
    ),
  );

  let updated = 0;

  console.log(normalizedRows[0]);

  for (const row of normalizedRows) {
    const tm = row['ТМ'] || '';
    const productName = row['товар'] || '';
    const price = Number(row['ціна']) || 0;
    const priceTypeId = PRICE_TYPES[row['Тип ціни']];

    if (!productName || !priceTypeId) {
      continue;
    }

    await pool.query(
      `
      INSERT INTO prices (
        tm,
        supplier,
        product_name,
        price,
        price_type_id
      )
      VALUES ($1, $2, $3, $4, $5)

      ON CONFLICT (
        supplier,
        product_name,
        price_type_id
      )
      DO UPDATE SET
        tm = EXCLUDED.tm,
        price = EXCLUDED.price
      `,
      [tm, supplier, productName, price, priceTypeId],
    );

    updated++;
  }

  return updated;
};
