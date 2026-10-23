import XLSX from 'xlsx';
import { getPool } from '../db/index.js';
import { refreshSalesHistoryDaily } from '../models/laskaSalesHistoryDailyModel.js';

const BATCH_SIZE = 1000;
const SALES_COLUMNS = [
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

const textOrNull = (value) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
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

  const text = textOrNull(value);
  if (!text) return null;

  const match = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (
      date.getUTCFullYear() !== Number(year) ||
      date.getUTCMonth() + 1 !== Number(month) ||
      date.getUTCDate() !== Number(day)
    ) {
      return null;
    }
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (
      date.getUTCFullYear() !== Number(year) ||
      date.getUTCMonth() + 1 !== Number(month) ||
      date.getUTCDate() !== Number(day)
    ) {
      return null;
    }
    return text;
  }
  return null;
};

const rowToSale = (row, fileName, rowNumber) => {
  const sale = {
    sale_date: dateToSqlDate(row[0]),
    ta: textOrNull(row[3]),
    store_code: textOrNull(row[4]),
    store_name: textOrNull(row[5]),
    product_code: textOrNull(row[7]),
    product_name: textOrNull(row[8]),
    quantity: numberOrNull(row[9]),
    amount: numberOrNull(row[10]),
    price: numberOrNull(row[11]),
    invoice_number: textOrNull(row[12]),
    address: textOrNull(row[13]),
    purchase_price: numberOrNull(row[14]),
    weight: numberOrNull(row[15]),
  };

  const missing = [
    ['дата', sale.sale_date],
    ['ТТ', sale.ta],
    ['код магазину', sale.store_code],
    ['код товару', sale.product_code],
    ['номер накладної', sale.invoice_number],
    ['кількість', sale.quantity],
    ['сума', sale.amount],
  ].find(([, value]) => value === null || value === undefined);
  if (missing) {
    throw new Error(`${fileName}, рядок ${rowNumber}: некоректне поле "${missing[0]}"`);
  }

  return sale;
};

const insertStageBatch = async (client, rows) => {
  if (!rows.length) return;
  const values = rows.flatMap((sale) => SALES_COLUMNS.map((column) => sale[column]));
  const placeholders = rows.map((_, rowIndex) => {
    const offset = rowIndex * SALES_COLUMNS.length;
    return `(${SALES_COLUMNS.map((__, columnIndex) => `$${offset + columnIndex + 1}`).join(', ')})`;
  });

  await client.query(
    `INSERT INTO pg_temp.laska_sales_import_stage (${SALES_COLUMNS.join(', ')}) VALUES ${placeholders.join(', ')}`,
    values,
  );
};

const readFile = async (filePath, fileName, fileKey, client, rowsByFile, dates) => {
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error(`${fileName}: файл не містить аркуша`);

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: null,
    range: 5,
  });
  let count = 0;
  let batch = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (row.every((value) => value == null || String(value).trim() === '')) {
      continue;
    }

    const sale = rowToSale(row, fileName, index + 6);
    batch.push(sale);
    dates.add(sale.sale_date);
    count += 1;
    if (batch.length === BATCH_SIZE) {
      await insertStageBatch(client, batch);
      batch = [];
    }
  }

  await insertStageBatch(client, batch);
  rowsByFile[fileKey] = count;
  return count;
};

export const importLaskaSales = async (input) => {
  const files = (Array.isArray(input) ? input : [{ filePath: input }]).map(
    (file) => ({
      filePath: file.filePath,
      fileName: file.name || file.fileName || file.filePath.split(/[\\/]/).pop(),
      id: file.id,
    }),
  );
  if (files.length === 0) {
    return { inserted: 0, deleted: 0, dates: [], rowsByFile: {} };
  }

  const client = await getPool('laska').connect();
  const dates = new Set();
  const rowsByFile = {};

  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(73501421, 2)');
    await client.query(`
      CREATE TEMP TABLE laska_sales_import_stage (
        sale_date date NOT NULL,
        ta text,
        store_code text,
        store_name text,
        product_code text,
        product_name text,
        quantity numeric,
        amount numeric,
        price numeric,
        invoice_number text,
        address text,
        purchase_price numeric,
        weight numeric
      ) ON COMMIT DROP
    `);

    for (const file of files) {
      await readFile(
        file.filePath,
        file.fileName,
        file.id || file.fileName,
        client,
        rowsByFile,
        dates,
      );
    }

    if (!dates.size) {
      await client.query('COMMIT');
      return { inserted: 0, deleted: 0, dates: [], rowsByFile };
    }

    const deleted = await client.query(`
      DELETE FROM sales
      WHERE sale_date IN (
        SELECT DISTINCT sale_date FROM pg_temp.laska_sales_import_stage
      )
    `);
    const inserted = await client.query(`
      INSERT INTO sales (${SALES_COLUMNS.join(', ')})
      SELECT ${SALES_COLUMNS.join(', ')}
      FROM pg_temp.laska_sales_import_stage
    `);
    const importedDates = [...dates].sort();
    const salesHistoryDaily = await refreshSalesHistoryDaily({
      dates: importedDates,
      client,
    });

    await client.query('COMMIT');
    return {
      inserted: inserted.rowCount,
      deleted: deleted.rowCount,
      dates: importedDates,
      rowsByFile,
      salesHistoryDaily,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
