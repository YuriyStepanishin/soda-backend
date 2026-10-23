import XLSX from 'xlsx';
import { agentDepartments } from '../config/users_db/olgatorgUsers.js';
import { getPool } from '../db/index.js';
import {
  ensureOlgatorgRouteTmHistory,
  refreshOlgatorgRouteTmHistory,
} from '../models/olgatorgSalesHistoryModel.js';

const BATCH_SIZE = 400;
const STAGE_TABLE = 'olgatorg_sales_import_stage';

const SALES_COLUMNS = [
  'month',
  'sale_date',
  'tm',
  'product_name',
  'barcode',
  'volume',
  'weight',
  'qty',
  'amount',
  'client_code',
  'client_name',
  'address',
  'outlet_name',
  'outlet_type',
  'outlet_code',
  'agent_name',
  'department',
  'supervisor_name',
  'price',
  'discount',
  'alt_name',
  'price_type',
];

const STAGE_COLUMNS = [
  'source_file_id',
  'source_file_name',
  'source_row',
  ...SALES_COLUMNS,
];

const MAIN_HEADERS = [
  [0, 'Месяц'],
  [1, 'Дата'],
  [2, 'ТМ'],
  [3, 'Товар'],
  [4, 'ШтрихКод'],
  [5, 'Объем'],
  [6, 'Вес'],
  [7, 'Кво'],
  [8, 'Сумма'],
  [9, 'Клиент'],
  [12, 'Точка'],
  [14, 'Код ТТ'],
  [15, 'Агент'],
  [16, 'Супер'],
];

const DETAIL_HEADERS = [
  [9, 'ОКПО'],
  [10, 'Название'],
  [11, 'Факт. адрес'],
  [12, 'Название'],
  [13, 'Тип'],
];

const cellValue = (value) => {
  if (value == null || typeof value !== 'object' || value instanceof Date) {
    return value;
  }

  if (Object.hasOwn(value, 'result')) return value.result;
  if (typeof value.text === 'string') return value.text;
  if (Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text || '').join('');
  }

  return value;
};

const sourceError = (fileName, rowNumber, message) =>
  new Error(`${fileName}, рядок ${rowNumber}: ${message}`);

const isEmptyCell = (value) =>
  value == null || (typeof value === 'string' && !value.trim());

const isEmptyRow = (values) => values.every(isEmptyCell);

const validateHeaders = (fileName, headerRows) => {
  for (const [rowNumber, expectedHeaders] of [
    [3, MAIN_HEADERS],
    [4, DETAIL_HEADERS],
  ]) {
    const values = headerRows.get(rowNumber);
    if (!values) {
      throw new Error(`${fileName}: відсутній рядок заголовків ${rowNumber}`);
    }

    for (const [column, expected] of expectedHeaders) {
      const actual = String(values[column] ?? '').trim();
      if (actual !== expected) {
        throw sourceError(
          fileName,
          rowNumber,
          `у колонці ${column + 1} очікувався заголовок "${expected}", отримано "${actual || 'порожньо'}"`,
        );
      }
    }
  }
};

const validateNoExtraColumns = (fileName, rowNumber, values) => {
  if (values.slice(17).some((value) => !isEmptyCell(value))) {
    throw sourceError(
      fileName,
      rowNumber,
      'знайдені дані поза очікуваними 17 колонками',
    );
  }
};

const validDateParts = (year, month, day) => {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const parseSaleDate = (value) => {
  value = cellValue(value);

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return validDateParts(
      value.getUTCFullYear(),
      value.getUTCMonth() + 1,
      value.getUTCDate(),
    );
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const parts = XLSX.SSF.parse_date_code(value);
    return parts ? validDateParts(parts.y, parts.m, parts.d) : null;
  }

  if (typeof value !== 'string') return null;
  const text = value.trim();
  const localDate = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (localDate) {
    return validDateParts(
      Number(localDate[3]),
      Number(localDate[2]),
      Number(localDate[1]),
    );
  }

  const isoDate = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDate) {
    return validDateParts(
      Number(isoDate[1]),
      Number(isoDate[2]),
      Number(isoDate[3]),
    );
  }

  return null;
};

const parseDecimal = (value, fieldName, fileName, rowNumber, required) => {
  value = cellValue(value);
  if (isEmptyCell(value)) {
    if (!required) return null;
    throw sourceError(fileName, rowNumber, `${fieldName} обов'язкове числове поле`);
  }

  if (typeof value === 'boolean' || value instanceof Date) {
    throw sourceError(fileName, rowNumber, `${fieldName} має бути числом`);
  }

  if (typeof value === 'number') {
    if (Number.isFinite(value)) return value;
    throw sourceError(fileName, rowNumber, `${fieldName} має бути скінченним числом`);
  }

  let text = String(value).trim().replace(/[\s\u00a0]/g, '');
  if (text.includes(',') && text.includes('.')) {
    if (!/^[+-]?\d{1,3}(?:\.\d{3})+,\d+$/.test(text)) {
      throw sourceError(fileName, rowNumber, `${fieldName} має некоректний числовий формат`);
    }
    text = text.replace(/\./g, '').replace(',', '.');
  } else if (text.includes(',')) {
    if (!/^[+-]?\d+,\d+$/.test(text)) {
      throw sourceError(fileName, rowNumber, `${fieldName} має некоректний числовий формат`);
    }
    text = text.replace(',', '.');
  }

  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) {
    throw sourceError(fileName, rowNumber, `${fieldName} має некоректний числовий формат`);
  }

  const number = Number(text);
  if (!Number.isFinite(number)) {
    throw sourceError(fileName, rowNumber, `${fieldName} має бути скінченним числом`);
  }

  return number;
};

const textValue = (value) => {
  value = cellValue(value);
  if (isEmptyCell(value)) return null;
  if (value instanceof Date || typeof value === 'boolean') return String(value);
  return String(value).trim() || null;
};

const normalizeVolume = (value, fileName, rowNumber) => {
  const volume = textValue(value);
  if (volume && volume.length > 50) {
    throw sourceError(fileName, rowNumber, 'обсяг перевищує 50 символів');
  }
  return volume;
};

const parseMonth = (value, saleDate, fileName, rowNumber) => {
  const month = parseDecimal(value, 'Місяць', fileName, rowNumber, true);
  const dateMonth = Number(saleDate.slice(5, 7));

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw sourceError(fileName, rowNumber, 'місяць має бути цілим числом від 1 до 12');
  }
  if (month !== dateMonth) {
    throw sourceError(fileName, rowNumber, 'місяць не відповідає даті продажу');
  }

  return month;
};

const deriveDiscount = (amount, price, productPrices) => {
  if (!productPrices) return { discount: null, priceType: null };

  const { retailPrice, bplPrice, bpl5Price, bpl8Price } = productPrices;
  const hasRetailPrice = Number.isFinite(retailPrice) && retailPrice > 0;

  if (amount === 0) return { discount: 'Повернення', priceType: 'Повернення' };
  if (!hasRetailPrice) return { discount: null, priceType: null };
  if (price >= retailPrice) return { discount: 'Роздріб', priceType: 'Роздріб' };
  if (Number.isFinite(bplPrice) && Math.abs(price - bplPrice) < 0.01) {
    return { discount: 'БПЛ', priceType: 'БПЛ' };
  }
  if (Number.isFinite(bpl5Price) && Math.abs(price - bpl5Price) < 0.01) {
    return { discount: 'БПЛ -5%', priceType: 'БПЛ -5%' };
  }
  if (Number.isFinite(bpl8Price) && Math.abs(price - bpl8Price) < 0.01) {
    return { discount: 'БПЛ -8%', priceType: 'БПЛ -8%' };
  }

  const saleDiscount = (retailPrice - price) / retailPrice;
  return {
    discount: `${Math.round(saleDiscount * 100)}%`,
    priceType:
      saleDiscount < 0.075
        ? 'до 7.5%'
        : saleDiscount <= 0.12
          ? '7.5%-12%'
          : 'понад 12%',
  };
};

export const parseOlgatorgSourceRow = ({
  values,
  fileName,
  rowNumber,
  pricesMap = new Map(),
}) => {
  const saleDate = parseSaleDate(values[1]);
  if (!saleDate) {
    throw sourceError(fileName, rowNumber, 'дата продажу відсутня або некоректна');
  }

  const month = parseMonth(values[0], saleDate, fileName, rowNumber);
  const productName = textValue(values[3]);
  if (!productName) {
    throw sourceError(fileName, rowNumber, 'назва товару відсутня');
  }

  const quantity = parseDecimal(values[7], 'Кво', fileName, rowNumber, true);
  const amount = parseDecimal(values[8], 'Сума', fileName, rowNumber, true);
  const weight = parseDecimal(values[6], 'Вага', fileName, rowNumber, false);
  const price = quantity > 0 ? Number((amount / quantity).toFixed(2)) : 0;
  if (!Number.isFinite(price)) {
    throw sourceError(fileName, rowNumber, 'обчислена ціна некоректна');
  }

  const agentName = textValue(values[15]);
  const outletName = textValue(values[12]);
  const address = textValue(values[11]);
  const discountInfo = deriveDiscount(amount, price, pricesMap.get(productName));

  return [
    month,
    saleDate,
    textValue(values[2]),
    productName,
    textValue(values[4]) || '',
    normalizeVolume(values[5], fileName, rowNumber),
    weight,
    quantity,
    amount,
    textValue(values[9]),
    textValue(values[10]),
    address,
    outletName,
    textValue(values[13]),
    textValue(values[14]),
    agentName,
    agentName ? agentDepartments[agentName] || 'Інше' : null,
    textValue(values[16]),
    price,
    discountInfo.discount,
    `${outletName || ''} (${address || ''})`,
    discountInfo.priceType,
  ];
};

const processWorkbookRows = async ({
  filePath,
  fileName,
  pricesMap,
  onSourceRow,
}) => {
  const extension = fileName.toLowerCase().split('.').pop();
  const headerRows = new Map();
  let rowCount = 0;
  let salesRows = 0;

  const processRow = async (rowNumber, values, extraValues = []) => {
    rowCount += 1;
    validateNoExtraColumns(fileName, rowNumber, [...values, ...extraValues]);

    if (rowNumber === 3 || rowNumber === 4) {
      headerRows.set(rowNumber, values);
      if (rowNumber === 4) validateHeaders(fileName, headerRows);
      return;
    }
    if (rowNumber < 5 || isEmptyRow(values)) return;

    const sale = parseOlgatorgSourceRow({
      values,
      fileName,
      rowNumber,
      pricesMap,
    });
    await onSourceRow({ sale, rowNumber });
    salesRows += 1;
  };

  if (!['xlsx', 'xls'].includes(extension)) {
    throw new Error(`${fileName}: підтримуються лише файли XLS та XLSX`);
  }

  const workbook = XLSX.readFile(filePath, { cellDates: true });
  if (workbook.SheetNames.length !== 1) {
    throw new Error(`${fileName}: очікується один аркуш із продажами`);
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet['!ref']) throw new Error(`${fileName}: аркуш порожній`);

  const range = XLSX.utils.decode_range(sheet['!ref']);
  for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
    const values = [];
    const extraValues = [];
    for (let column = 0; column <= range.e.c; column += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: column })];
      const value = cellValue(cell?.v) ?? null;
      if (column < 17) values.push(value);
      else extraValues.push(value);
    }
    while (values.length < 17) values.push(null);
    await processRow(rowIndex + 1, values, extraValues);
  }

  validateHeaders(fileName, headerRows);
  return { rowCount, salesRows };
};

const createStageTable = async (client) => {
  await client.query(`DROP TABLE IF EXISTS pg_temp.${STAGE_TABLE}`);
  await client.query(`
    CREATE TEMP TABLE ${STAGE_TABLE} (
      source_file_id text NOT NULL,
      source_file_name text NOT NULL,
      source_row integer NOT NULL,
      month integer NOT NULL,
      sale_date date NOT NULL,
      tm text,
      product_name text NOT NULL,
      barcode text NOT NULL,
      volume varchar(50),
      weight numeric,
      qty numeric NOT NULL,
      amount numeric NOT NULL,
      client_code text,
      client_name text,
      address text,
      outlet_name text,
      outlet_type text,
      outlet_code text,
      agent_name text,
      department text,
      supervisor_name text,
      price numeric NOT NULL,
      discount text,
      alt_name text,
      price_type text
    ) ON COMMIT DROP
  `);
};

const insertStageBatch = async (client, rows) => {
  if (!rows.length) return;

  const values = rows.flat();
  const placeholders = rows.map((row, rowIndex) => {
    const start = rowIndex * STAGE_COLUMNS.length;
    return `(${row.map((_, columnIndex) => `$${start + columnIndex + 1}`).join(', ')})`;
  });

  await client.query(
    `
    INSERT INTO pg_temp.${STAGE_TABLE} (${STAGE_COLUMNS.join(', ')})
    VALUES ${placeholders.join(', ')}
    `,
    values,
  );
};

const readPrices = async (client) => {
  const result = await client.query(`
    SELECT product_name, price, price_type_id
    FROM prices
  `);
  const pricesMap = new Map();

  for (const item of result.rows) {
    const key = String(item.product_name || '').trim();
    if (!key) continue;

    const productPrices = pricesMap.get(key) || {};
    const price = Number(item.price);
    switch (item.price_type_id) {
      case 1:
        productPrices.retailPrice = price;
        break;
      case 2:
        productPrices.bplPrice = price;
        break;
      case 3:
        productPrices.bpl5Price = price;
        break;
      case 4:
        productPrices.bpl8Price = price;
        break;
      default:
        break;
    }
    pricesMap.set(key, productPrices);
  }

  return pricesMap;
};

const assertNoSecondaryUniqueIndex = async (client) => {
  const result = await client.query(`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'sales'
      AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
      AND indexname <> 'sales_pkey'
  `);

  if (result.rows.length) {
    const names = result.rows.map((row) => row.indexname).join(', ');
    throw new Error(
      `OLGATORG sales має UNIQUE-індекс(и) ${names}; видаліть їх у Neon перед імпортом, інакше повторні продажі не збережуться`,
    );
  }
};

const stageSummary = async (client) => {
  const result = await client.query(`
    SELECT
      COUNT(*)::int AS row_count,
      COALESCE(
        array_agg(DISTINCT to_char(sale_date, 'YYYY-MM-DD')
          ORDER BY to_char(sale_date, 'YYYY-MM-DD')),
        ARRAY[]::text[]
      ) AS dates
    FROM pg_temp.${STAGE_TABLE}
  `);

  return {
    rowCount: Number(result.rows[0]?.row_count) || 0,
    dates: result.rows[0]?.dates || [],
  };
};

export const importOlgatorgSales = async (input) => {
  const files = (Array.isArray(input) ? input : [{ filePath: input }]).map(
    (file) => ({
      ...file,
      name: file.name || file.fileName || file.filePath.split(/[\\/]/).pop(),
    }),
  );
  if (files.length === 0) {
    return { inserted: 0, deleted: 0, dates: [], rowsByFile: {} };
  }

  await ensureOlgatorgRouteTmHistory();
  const client = await getPool('olgatorg').connect();
  const dates = new Set();
  const rowsByFile = {};

  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(73501421, 1)');
    await createStageTable(client);
    const pricesMap = await readPrices(client);
    const pendingRows = [];

    for (const file of files) {
      let fileRows = 0;
      await processWorkbookRows({
        filePath: file.filePath,
        fileName: file.name,
        pricesMap,
        onSourceRow: async ({ sale, rowNumber }) => {
          dates.add(sale[1]);
          pendingRows.push([file.id || file.name, file.name, rowNumber, ...sale]);
          fileRows += 1;
          if (pendingRows.length >= BATCH_SIZE) {
            await insertStageBatch(client, pendingRows.splice(0));
          }
        },
      });
      rowsByFile[file.id || file.name] = fileRows;
    }

    await insertStageBatch(client, pendingRows.splice(0));
    const staged = await stageSummary(client);
    const expectedRows = Object.values(rowsByFile).reduce(
      (total, count) => total + count,
      0,
    );
    if (staged.rowCount !== expectedRows) {
      throw new Error('Кількість рядків у staging не збігається з кількістю прочитаних');
    }
    await assertNoSecondaryUniqueIndex(client);

    if (staged.dates.length === 0) {
      await client.query('COMMIT');
      return { inserted: 0, deleted: 0, dates: [], rowsByFile };
    }

    const deleted = await client.query(`
      DELETE FROM public.sales
      WHERE sale_date IN (
        SELECT DISTINCT sale_date
        FROM pg_temp.${STAGE_TABLE}
      )
    `);
    const inserted = await client.query(`
      INSERT INTO public.sales (${SALES_COLUMNS.join(', ')})
      SELECT ${SALES_COLUMNS.join(', ')}
      FROM pg_temp.${STAGE_TABLE}
      ORDER BY source_file_id, source_row
    `);

    for (const periodType of ['week', 'month']) {
      await refreshOlgatorgRouteTmHistory({
        periodType,
        dates: staged.dates,
        client,
      });
    }

    await client.query('COMMIT');
    return {
      inserted: inserted.rowCount,
      deleted: deleted.rowCount,
      dates: staged.dates,
      rowsByFile,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
