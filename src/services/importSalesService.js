import XLSX from 'xlsx';
import { pool } from '../db/connectNeon.js';
import { excelDateToJSDate } from '../utils/excelDateToJSDate.js';

export const importSalesService = async (filePath) => {
  const workbook = XLSX.readFile(filePath);

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
  });
  const dataRows = rows
    .slice(4)
    .filter((row) => row && row[1] && row[3] && row[8]);

  console.log('Всього рядків:', rows.length);
  console.log('Рядків для імпорту:', dataRows.length);

  const pricesResult = await pool.query(`
    SELECT
      product_name,
      retail_price,
      bpl_price,
      bpl5_price,
      bpl8_price
    FROM prices
  `);

  const pricesMap = new Map();

  pricesResult.rows.forEach((item) => {
    pricesMap.set(item.product_name.trim(), {
      retailPrice: Number(item.retail_price),
      bplPrice: Number(item.bpl_price),
      bpl5Price: Number(item.bpl5_price),
      bpl8Price: Number(item.bpl8_price),
    });
  });

  const batchSize = 1000;
  let inserted = 0;

  for (let i = 0; i < dataRows.length; i += batchSize) {
    const batch = dataRows.slice(i, i + batchSize);

    const values = [];
    const placeholders = [];

    batch.forEach((row, rowIndex) => {
      const COLUMN_COUNT = 21;
      const base = rowIndex * COLUMN_COUNT;

      placeholders.push(`
        (
          $${base + 1},
          $${base + 2},
          $${base + 3},
          $${base + 4},
          $${base + 5},
          $${base + 6},
          $${base + 7},
          $${base + 8},
          $${base + 9},
          $${base + 10},
          $${base + 11},
          $${base + 12},
          $${base + 13},
          $${base + 14},
          $${base + 15},
          $${base + 16},
          $${base + 17},
          $${base + 18},
          $${base + 19},
          $${base + 20},
          $${base + 21}
        )
      `);

      const qty = Number(row[7]) || 0;
      const amount = Number(row[8]) || 0;

      const price = qty > 0 ? Number((amount / qty).toFixed(2)) : 0;

      const altName = `${row[12] || ''} (${row[11] || ''})`;

      const productName = (row[3] || '').trim();

      const productPrice = pricesMap.get(productName);

      let discount = null;
      let priceType = null;

      if (productPrice) {
        const { retailPrice, bplPrice, bpl5Price, bpl8Price } = productPrice;

        if (amount === 0) {
          discount = 'Повернення';
          priceType = 'Повернення';
        } else if (price >= retailPrice) {
          discount = 'Роздріб';
          priceType = 'Роздріб';
        } else if (Math.abs(price - bplPrice) < 0.01) {
          discount = 'БПЛ';
          priceType = 'БПЛ';
        } else if (Math.abs(price - bpl5Price) < 0.01) {
          discount = 'БПЛ -5%';
          priceType = 'БПЛ -5%';
        } else if (Math.abs(price - bpl8Price) < 0.01) {
          discount = 'БПЛ -8%';
          priceType = 'БПЛ -8%';
        } else {
          const saleDiscount = (retailPrice - price) / retailPrice;

          discount = `${Math.round(saleDiscount * 100)}%`;

          if (saleDiscount < 0.075) {
            priceType = 'до 7.5%';
          } else if (saleDiscount <= 0.12) {
            priceType = '7.5%-12%';
          } else {
            priceType = 'понад 12%';
          }
        }
      } else {
        console.log('NOT FOUND:', productName);
      }

      values.push(
        row[0] ?? null,
        row[1] ? excelDateToJSDate(row[1]) : null,
        row[2] ?? null,
        row[3] ?? null,
        row[4] ?? null,
        row[5] ?? null,
        row[6] ?? null,
        row[7] ?? null,
        row[8] ?? null,
        row[9] ?? null,
        row[10] ?? null,
        row[11] ?? null,
        row[12] ?? null,
        row[13] ?? null,
        row[14] ?? null,
        row[15] ?? null,
        row[16] ?? null,
        price,
        discount,
        altName,
        priceType,
      );
    });

    const query = `
      INSERT INTO sales (
        month,
        sale_date,
        tm,
        product_name,
        barcode,
        volume,
        weight,
        qty,
        amount,
        client_code,
        client_name,
        address,
        outlet_name,
        outlet_type,
        outlet_code,
        agent_name,
        supervisor_name,
        price,
        discount,
        alt_name,
        price_type
      )
      VALUES
      ${placeholders.join(',')}
      ON CONFLICT DO NOTHING
    `;

    await pool.query(query, values);

    inserted += batch.length;

    console.log(`Processed: ${inserted} / ${dataRows.length}`);
  }

  return inserted;
};
