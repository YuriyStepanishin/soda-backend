import { laskaPool } from '../db/connectLaskaNeon.js';

const STORE_EXPR = `COALESCE(NULLIF(TRIM("ТТ"), ''), 'Без ТТ')`;
const BRAND_EXPR = `COALESCE(NULLIF(TRIM("ТМ"), ''), 'Без ТМ')`;
const PRODUCT_EXPR = `COALESCE(NULLIF(TRIM("Наименование товара"), ''), 'Без товару')`;
const numericValue = column =>
  `NULLIF(REPLACE(REPLACE(TRIM(COALESCE(${column}::text, '0')), ' ', ''), ',', '.'), '')::numeric`;

function buildLaskaWhere(query = {}) {
  const conditions = [];
  const params = [];

  const add = (condition, value) => {
    params.push(value);
    conditions.push(condition.replace('?', `$${params.length}`));
  };

  const filters = [
    ['dateFrom', '"Дата" >= ?'],
    ['dateTo', '"Дата" <= ?'],
    ['ta', '"ТА" = ?'],
    ['department', '"Відділ" = ?'],
    ['route', '"Маршрут" = ?'],
    ['storeCode', '"Код ТТ" = ?'],
    ['manufacturer', '"Виробник" = ?'],
    ['tm', '"ТМ" = ?'],
    ['group', '"Група" = ?'],
    ['subgroup', '"Підгрупа" = ?'],
    ['store', '"ТТ" = ?'],
    ['product', '"Наименование товара" = ?'],
  ];

  filters.forEach(([key, condition]) => {
    if (query[key]) add(condition, query[key]);
  });

  return {
    where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

async function queryRows(sql, query) {
  const filter = buildLaskaWhere(query);
  const result = await laskaPool.query(
    sql.replace('__WHERE__', filter.where),
    filter.params
  );
  return result.rows;
}

export async function getLaskaSalesSummary(req, res) {
  try {
    const [rows, totals] = await Promise.all([
      queryRows(
        `
        SELECT
          ${BRAND_EXPR} AS tm,
          COALESCE(NULLIF(TRIM("Група"), ''), 'Без групи') AS "group",
          COUNT(DISTINCT ${STORE_EXPR})::int AS stores,
          ROUND(COALESCE(SUM(${numericValue('"Шт"')}), 0)::numeric, 2) AS quantity,
          ROUND(COALESCE(SUM(${numericValue('"Вес"')}), 0)::numeric, 2) AS weight,
          COUNT(*)::int AS sku,
          ROUND(COALESCE(SUM(${numericValue('"Сумма"')}), 0)::numeric, 2) AS amount
        FROM public.sales_laska
        __WHERE__
        GROUP BY ${BRAND_EXPR}, COALESCE(NULLIF(TRIM("Група"), ''), 'Без групи')
        ORDER BY amount DESC
        `,
        req.query
      ),
      queryRows(
        `
        SELECT
          COUNT(DISTINCT ${STORE_EXPR})::int AS stores,
          ROUND(COALESCE(SUM(${numericValue('"Шт"')}), 0)::numeric, 2) AS quantity,
          ROUND(COALESCE(SUM(${numericValue('"Вес"')}), 0)::numeric, 2) AS weight,
          COUNT(*)::int AS sku,
          ROUND(COALESCE(SUM(${numericValue('"Сумма"')}), 0)::numeric, 2) AS amount
        FROM public.sales_laska
        __WHERE__
        `,
        req.query
      ),
    ]);

    res.json({ success: true, data: rows, totals: totals[0] });
  } catch (error) {
    console.error('[LASKA SUMMARY ERROR]', error);
    res.status(500).json({ success: false, message: error.message });
  }
}

export async function getLaskaStores(req, res) {
  try {
    const rows = await queryRows(
      `
        SELECT
          ${STORE_EXPR} AS name,
          ROUND(COALESCE(SUM(${numericValue('"Сумма"')}), 0)::numeric, 2) AS sum,
          ROUND(COALESCE(SUM(${numericValue('"Шт"')}), 0)::numeric, 2) AS quantity,
          ROUND(COALESCE(SUM(${numericValue('"Вес"')}), 0)::numeric, 2) AS weight,
          COUNT(*)::int AS sku
        FROM public.sales_laska
        __WHERE__
        GROUP BY ${STORE_EXPR}
        ORDER BY sum DESC
      `,
      req.query
    );

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('[LASKA STORES ERROR]', error);
    res.status(500).json({ success: false, message: error.message });
  }
}

export async function getLaskaProducts(req, res) {
  try {
    const rows = await queryRows(
      `
        SELECT
          ${PRODUCT_EXPR} AS name,
          ROUND(COALESCE(SUM(${numericValue('"Шт"')}), 0)::numeric, 2) AS quantity,
          ROUND(COALESCE(SUM(${numericValue('"Сумма"')}), 0)::numeric, 2) AS amount
        FROM public.sales_laska
        __WHERE__
        GROUP BY ${PRODUCT_EXPR}
        ORDER BY amount DESC
      `,
      req.query
    );

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('[LASKA PRODUCTS ERROR]', error);
    res.status(500).json({ success: false, message: error.message });
  }
}

export async function getLaskaHierarchy(req, res) {
  try {
    const rows = await queryRows(
      `
        SELECT
          COALESCE(NULLIF(TRIM("Група"), ''), 'Без групи') AS "group",
          COALESCE(NULLIF(TRIM("Підгрупа"), ''), 'Без підгрупи') AS subgroup,
          ${BRAND_EXPR} AS tm,
          ROUND(COALESCE(SUM(${numericValue('"Шт"')}), 0)::numeric, 2) AS quantity,
          ROUND(COALESCE(SUM(${numericValue('"Вес"')}), 0)::numeric, 2) AS weight,
          ROUND(COALESCE(SUM(${numericValue('"Сумма"')}), 0)::numeric, 2) AS amount,
          COUNT(*)::int AS sku,
          COUNT(DISTINCT ${STORE_EXPR})::int AS stores
        FROM public.sales_laska
        __WHERE__
        GROUP BY
          COALESCE(NULLIF(TRIM("Група"), ''), 'Без групи'),
          COALESCE(NULLIF(TRIM("Підгрупа"), ''), 'Без підгрупи'),
          ${BRAND_EXPR}
        ORDER BY "group", subgroup, amount DESC, tm
      `,
      req.query
    );

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('[LASKA HIERARCHY ERROR]', error);
    res.status(500).json({ success: false, message: error.message });
  }
}

export async function getLaskaFilters(req, res) {
  try {
    const filter = buildLaskaWhere(req.query);
    const queries = [
      ['departments', '"Відділ"'],
      ['agents', '"ТА"'],
      ['stores', '"ТТ"'],
      ['brands', '"ТМ"'],
      ['products', '"Наименование товара"'],
    ];
    const results = await Promise.all(
      queries.map(([, column]) =>
        laskaPool.query(
          `SELECT DISTINCT ${column} AS value FROM public.sales_laska ${filter.where} ORDER BY value`,
          filter.params
        )
      )
    );

    const response = Object.fromEntries(
      queries.map(([key], index) => [
        key,
        results[index].rows.map(row => row.value).filter(Boolean),
      ])
    );

    res.json({ success: true, ...response });
  } catch (error) {
    console.error('[LASKA FILTERS ERROR]', error);
    res.status(500).json({ success: false, message: error.message });
  }
}
