import XLSX from 'xlsx';
import { getPool } from '../db/index.js';
import { refreshSalesHistoryDaily } from '../models/laskaSalesHistoryDailyModel.js';

const laskaPool = getPool('laska');

const BATCH_SIZE = 1000;

const textOrNull = (value) => {
  if (value === null || value === undefined) return null;

  const valueAsText = String(value).trim();
  return valueAsText || null;
};

const numberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;

  const number = Number(String(value).replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(number) ? number : null;
};

const dateToSqlDate = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    if (!date) return null;

    return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
  }

  const valueAsText = textOrNull(value);
  if (!valueAsText) return null;

  const dateMatch = valueAsText.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (dateMatch) {
    const [, day, month, year] = dateMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const parsed = new Date(valueAsText);
  return Number.isNaN(parsed.getTime())
    ? null
    : parsed.toISOString().slice(0, 10);
};

const rowToSale = (row) => ({
  saleDate: dateToSqlDate(row[0]),
  ta: textOrNull(row[3]),
  storeCode: textOrNull(row[4]),
  storeName: textOrNull(row[5]),
  productCode: textOrNull(row[7]),
  productName: textOrNull(row[8]),
  quantity: numberOrNull(row[9]),
  amount: numberOrNull(row[10]),
  price: numberOrNull(row[11]),
  invoiceNumber: textOrNull(row[12]),
  address: textOrNull(row[13]),
  purchasePrice: numberOrNull(row[14]),
  weight: numberOrNull(row[15]),
});

const isValidSale = (sale) =>
  sale.saleDate &&
  sale.ta &&
  sale.storeCode &&
  sale.productCode &&
  sale.invoiceNumber;

const insertBatch = async (batch) => {
  const columns = [
    'sale_date',
    'ta',
    'store_code',
    'store_name',
    'product_code',
    'product_name',
    'quantity',
    'amount',
    'price',
    'invoice_number',
    'address',
    'purchase_price',
    'weight',
  ];
  const values = [];
  const placeholders = batch.map((sale, rowIndex) => {
    const rowValues = [
      sale.saleDate,
      sale.ta,
      sale.storeCode,
      sale.storeName,
      sale.productCode,
      sale.productName,
      sale.quantity,
      sale.amount,
      sale.price,
      sale.invoiceNumber,
      sale.address,
      sale.purchasePrice,
      sale.weight,
    ];

    values.push(...rowValues);
    const start = rowIndex * columns.length;
    return `(${rowValues.map((_, index) => `$${start + index + 1}`).join(', ')})`;
  });

  const query = `
    WITH incoming (${columns.join(', ')}) AS (
      VALUES ${placeholders.join(', ')}
    ), updated AS (
      UPDATE sales AS existing
      SET
        ta = incoming.ta,
        store_name = incoming.store_name,
        product_name = incoming.product_name,
        quantity = incoming.quantity::numeric,
        amount = incoming.amount::numeric,
        price = incoming.price::numeric,
        address = incoming.address,
        purchase_price = incoming.purchase_price::numeric,
        weight = incoming.weight::numeric
      FROM incoming
      WHERE existing.sale_date = incoming.sale_date::date
        AND existing.store_code = incoming.store_code
        AND existing.product_code = incoming.product_code
        AND existing.invoice_number = incoming.invoice_number
      RETURNING 1
    ), inserted AS (
      INSERT INTO sales (${columns.join(', ')})
      SELECT
        incoming.sale_date::date,
        incoming.ta,
        incoming.store_code,
        incoming.store_name,
        incoming.product_code,
        incoming.product_name,
        incoming.quantity::numeric,
        incoming.amount::numeric,
        incoming.price::numeric,
        incoming.invoice_number,
        incoming.address,
        incoming.purchase_price::numeric,
        incoming.weight::numeric
      FROM incoming
      WHERE NOT EXISTS (
        SELECT 1
        FROM sales existing
        WHERE existing.sale_date = incoming.sale_date::date
          AND existing.store_code = incoming.store_code
          AND existing.product_code = incoming.product_code
          AND existing.invoice_number = incoming.invoice_number
      )
      RETURNING 1
    )
    SELECT
      (SELECT COUNT(*)::int FROM updated) AS updated,
      (SELECT COUNT(*)::int FROM inserted) AS inserted
  `;

  const result = await laskaPool.query(query, values);
  return result.rows[0];
};

export const importLaskaSales = async (filePath) => {
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    range: 5,
  });
  const sourceRows = rows.map(rowToSale).filter(isValidSale);
  const dataRows = Array.from(
    new Map(
      sourceRows.map((sale) => [
        JSON.stringify([
          sale.saleDate,
          sale.productCode,
          sale.storeCode,
          sale.invoiceNumber,
        ]),
        sale,
      ]),
    ).values(),
  );

  let inserted = 0;
  let updated = 0;
  for (let index = 0; index < dataRows.length; index += BATCH_SIZE) {
    const result = await insertBatch(dataRows.slice(index, index + BATCH_SIZE));
    inserted += result.inserted;
    updated += result.updated;
  }

  const importedDates = dataRows
    .map((sale) => sale.saleDate)
    .filter(Boolean)
    .sort();
  const historyRefresh = importedDates.length
    ? await refreshSalesHistoryDaily({
        dateFrom: importedDates[0],
        dateTo: importedDates[importedDates.length - 1],
      })
    : { refreshed: false, rows: 0 };

  return {
    sourceRows: sourceRows.length,
    inserted,
    updated,
    skipped: dataRows.length - inserted - updated,
    salesHistoryDaily: historyRefresh,
    startRow: 6,
  };
};
