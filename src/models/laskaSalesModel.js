import { getPool } from '../db/index.js';
import { buildDailySalesQuery } from '../utils/dailySalesQuery.js';
import { ROLES } from '../constants/roles.js';

const laskaPool = getPool('laska');

const GROUPING_FIELDS = new Set(['group', 'subgroup', 'tm', 'packing']);

const STORE_EXPR = `COALESCE(NULLIF(TRIM("ТТ"), ''), 'Без ТТ')`;

const BRAND_EXPR = `COALESCE(NULLIF(TRIM("ТМ"), ''), 'Без ТМ')`;

const HISTORY_GROUP_EXPRESSIONS = {
  group: `COALESCE(NULLIF(TRIM("Група"), ''), 'Без групи')`,
  tm: BRAND_EXPR,
  subgroup: `COALESCE(NULLIF(TRIM("Підгрупа"), ''), 'Без підгрупи')`,
  packing: `COALESCE(NULLIF(TRIM("Вес"::text), ''), 'Без фасовки')`,
};

const PRODUCT_EXPR = `COALESCE(NULLIF(TRIM("Наименование товара"), ''), 'Без товару')`;

const numericValue = (column) => `NULLIF(
  REPLACE(
    REPLACE(
      TRIM(COALESCE(${column}::text, '0')),
      ' ',
      ''
    ),
    ',',
    '.'
  ),
  ''
)::numeric`;

const normalizeFilterValues = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

export const validateGroupingFields = (value) => {
  if (typeof value !== 'string') return null;

  const fields = value
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return fields.some((field) => !GROUPING_FIELDS.has(field))
    ? 'groupingFields must contain only: group, subgroup, tm, packing'
    : null;
};

export const getEffectiveQuery = (req) => {
  const query = { ...req.query };

  if (query.agent && !query.ta) query.ta = query.agent;
  if (query.brands && !query.tm && !query.tms) query.tms = query.brands;
  if (query.stores && !query.store) query.store = query.stores;
  if (query.products && !query.product) query.product = query.products;
  if (query.groups && !query.group) query.group = query.groups;
  if (query.subgroups && !query.subgroup) query.subgroup = query.subgroups;
  if (query.packings && !query.packing) query.packing = query.packings;

  if (req.user?.role === ROLES.AGENT) {
    query.ta = req.user.representative;
  }

  if (req.user?.role === ROLES.SUPERVISOR) {
    query.departments = req.user.departments || [];
  }

  if (req.user?.role === ROLES.BRAND_MANAGER) {
    query.tms = req.user.brands || [];
  }

  return query;
};

export const buildLaskaWhere = (query = {}) => {
  const conditions = [];
  const params = [];

  const add = (condition, value) => {
    params.push(value);
    conditions.push(condition.replace('?', `$${params.length}`));
  };

  const filters = [
    ['dateFrom', '"Дата" >= ?'],
    ['dateTo', '"Дата" <= ?'],
  ];

  filters.forEach(([key, condition]) => {
    if (query[key]) {
      add(condition, query[key]);
    }
  });

  const addValueFilter = (key, expression) => {
    const values = normalizeFilterValues(query[key]);
    if (!values.length) return;

    if (values.length === 1) {
      add(`${expression} = ?`, values[0]);
      return;
    }

    params.push(values);
    conditions.push(`${expression} = ANY($${params.length})`);
  };

  addValueFilter('ta', '"ТА"');
  addValueFilter('department', '"Відділ"');
  addValueFilter('route', '"Маршрут"');
  addValueFilter('storeCode', '"Код ТТ"');
  addValueFilter('manufacturer', '"Виробник"');
  addValueFilter('tm', '"ТМ"');
  addValueFilter('group', '"Група"');
  addValueFilter('subgroup', '"Підгрупа"');
  addValueFilter('packing', `TRIM(COALESCE("Вес"::text, ''))`);
  addValueFilter('store', '"ТТ"');
  addValueFilter('product', '"Наименование товара"');

  const departments = normalizeFilterValues(query.departments);
  if (departments.length) {
    params.push(departments);
    conditions.push(`"Відділ" = ANY($${params.length})`);
  }

  const tms = normalizeFilterValues(query.tms);
  if (tms.length) {
    params.push(tms);
    conditions.push(`"ТМ" = ANY($${params.length})`);
  }

  return {
    where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
};

export const queryRows = async (sql, query = {}) => {
  const filter = buildLaskaWhere(query);

  const result = await laskaPool.query(
    sql.replace('__WHERE__', filter.where),
    filter.params,
  );

  return result.rows;
};

export const getSales = async ({ query, limit, offset }) => {
  const filter = buildLaskaWhere(query);
  const limitParam = filter.params.length + 1;
  const offsetParam = filter.params.length + 2;

  const countResult = await laskaPool.query(
    `SELECT COUNT(*)::int AS total FROM public.sales_laska ${filter.where}`,
    filter.params,
  );

  const total = countResult.rows[0]?.total ?? 0;

  const result = await laskaPool.query(
    `SELECT * FROM public.sales_laska ${filter.where} ORDER BY "Дата" DESC, "ТА", "ТТ" LIMIT $${limitParam} OFFSET $${offsetParam}`,
    [...filter.params, limit, offset],
  );

  return { rows: result.rows, total };
};

export const getSummary = async (query) => {
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
      query,
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
      query,
    ),
  ]);
  return { rows, totals: totals[0] };
};

export const getStores = async (query) =>
  queryRows(
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
    query,
  );

export const getProducts = async (query) =>
  queryRows(
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
    query,
  );

export const getHierarchy = async (query) =>
  queryRows(
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
    query,
  );

const DRILLDOWN_CONFIG = {
  store: {
    selectExpr: `COALESCE(NULLIF(TRIM("ТТ"), ''), 'Без ТТ')`,
    responseField: 'store',
    orderBy: 'group_value DESC',
  },
  date: {
    selectExpr: `"Дата"::date`,
    responseField: 'date',
    orderBy: 'group_value DESC',
  },
  brand: {
    selectExpr: `COALESCE(NULLIF(TRIM("ТМ"), ''), 'Без ТМ')`,
    responseField: 'brand',
    orderBy: 'group_value DESC',
  },
  product: {
    selectExpr: `COALESCE(NULLIF(TRIM("Наименование товара"), ''), 'Без товару')`,
    responseField: 'product',
    orderBy: 'group_value DESC',
  },
  department: {
    selectExpr: `COALESCE(NULLIF(TRIM("Відділ"), ''), 'Без відділу')`,
    responseField: 'department',
    orderBy: 'amount DESC, group_value ASC',
  },
  agent: {
    selectExpr: `COALESCE(NULLIF(TRIM("ТА"), ''), 'Без ТП')`,
    responseField: 'agent',
    orderBy: 'amount DESC, group_value ASC',
  },
};

export const getSalesDrilldown = async (groupBy, query) => {
  const config = DRILLDOWN_CONFIG[groupBy];

  if (!config) {
    throw new Error('Unsupported groupBy');
  }

  const filter = buildLaskaWhere(query);

  const result = await laskaPool.query(
    `
    SELECT
      ${config.selectExpr} AS group_value,
      COUNT(DISTINCT NULLIF(TRIM("ТТ"), ''))::int AS stores,
      ROUND(COALESCE(SUM(${numericValue('"Шт"')}), 0)::numeric, 2) AS quantity,
      ROUND(COALESCE(SUM(${numericValue('"Вес"')}), 0)::numeric, 2) AS weight,
      COUNT(*)::int AS sku,
      ROUND(COALESCE(SUM(${numericValue('"Сумма"')}), 0)::numeric, 2) AS amount,
      ROUND(
        COALESCE(AVG(NULLIF(${numericValue('"Цена"')}, 0)), 0)::numeric,
        2
      ) AS "averagePrice"
    FROM public.sales_laska
    ${filter.where}
    GROUP BY ${config.selectExpr}
    ORDER BY ${config.orderBy}
    `,
    filter.params,
  );

  return result.rows.map((row) => ({
    [config.responseField]: row.group_value,
    stores: row.stores,
    quantity: row.quantity,
    weight: row.weight,
    sku: row.sku,
    amount: row.amount,
    averagePrice: row.averagePrice,
  }));
};

const REPORT_FIELD_CONFIG = {
  group: {
    selectExpr: `COALESCE(NULLIF(TRIM("Група"), ''), 'Без групи')`,
  },
  subgroup: {
    selectExpr: `COALESCE(NULLIF(TRIM("Підгрупа"), ''), 'Без підгрупи')`,
  },
  brand: {
    selectExpr: BRAND_EXPR,
  },
  product: {
    selectExpr: PRODUCT_EXPR,
  },
  date: {
    selectExpr: `TO_CHAR("Дата"::date, 'YYYY-MM-DD')`,
  },
  store: {
    selectExpr: STORE_EXPR,
  },
  department: {
    selectExpr: `COALESCE(NULLIF(TRIM("Відділ"), ''), 'Без відділу')`,
  },
  agent: {
    selectExpr: `COALESCE(NULLIF(TRIM("ТА"), ''), 'Без ТП')`,
  },
};

export const getSalesReportRows = async (groupBy, query) => {
  const fields = groupBy.filter((field) => REPORT_FIELD_CONFIG[field]);
  const effectiveFields = fields.length ? fields : ['brand'];
  const filter = buildLaskaWhere(query);
  const expressions = effectiveFields.map(
    (field) => REPORT_FIELD_CONFIG[field].selectExpr,
  );

  const dimensionSelect = expressions
    .map((expression, index) => {
      const groupingExpression = expressions[index];
      return `CASE WHEN GROUPING(${groupingExpression}) = 0 THEN ${expression} ELSE NULL END AS dimension_${index}`;
    })
    .join(',\n      ');
  const groupingSetsSql = expressions
    .map((_, index) => `(${expressions.slice(0, index + 1).join(', ')})`)
    .join(', ');
  const orderBySql = expressions
    .map((_, index) => `dimension_${index}`)
    .join(' NULLS FIRST, ');
  const groupingLevelSql = `(${expressions.length} - (${expressions
    .map((expression) => `GROUPING(${expression})`)
    .join(' + ')})) - 1`;

  const result = await laskaPool.query(
    `
    SELECT
      ${dimensionSelect},
      ${groupingLevelSql} AS level,
      COUNT(DISTINCT ${STORE_EXPR})::int AS stores,
      ROUND(COALESCE(SUM(${numericValue('"Шт"')}), 0)::numeric, 2) AS quantity,
      ROUND(COALESCE(SUM(${numericValue('"Вес"')}), 0)::numeric, 2) AS weight,
      COUNT(*)::int AS sku,
      ROUND(COALESCE(SUM(${numericValue('"Сумма"')}), 0)::numeric, 2) AS amount
    FROM public.sales_laska
    ${filter.where}
    GROUP BY GROUPING SETS (${groupingSetsSql})
    ORDER BY ${orderBySql} NULLS FIRST
    `,
    filter.params,
  );

  return result.rows.map((row) => {
    const dimensions = Object.fromEntries(
      effectiveFields.map((field, index) => [
        field,
        row[`dimension_${index}`],
      ]),
    );

    return {
      dimensions,
      label:
        row[`dimension_${row.level}`] ||
        effectiveFields
          .map((field, index) => row[`dimension_${index}`])
          .filter(Boolean)
          .at(-1) ||
        'Без назви',
      path: effectiveFields
        .map((field, index) => row[`dimension_${index}`])
        .filter(Boolean)
        .join(' / '),
      level: Number(row.level),
      stores: row.stores,
      quantity: row.quantity,
      weight: row.weight,
      sku: row.sku,
      amount: row.amount,
    };
  });
};

// Daily reports do not need both dictionary joins on every scan.
const buildDailySource = (query, requiredColumns = '') => {
  const filter = buildLaskaWhere(query);
  const referenced = filter.where + requiredColumns;
  const columns = {
    'Дата': 's.sale_date', 'ТА': 's.ta', 'Код ТТ': 's.store_code',
    'ТТ': 's.store_name', 'Наименование товара': 's.product_name',
    'Вес': 's.weight', 'Відділ': 'a.department', 'Маршрут': 'a.route',
    'Виробник': 'p.manufacturer', 'ТМ': 'p.tm', 'Група': 'p.group_name', 'Підгрупа': 'p.subgroup',
  };
  const translate = (sql) => sql.replace(/"([^"\n]+)"/g, (match, column) => columns[column] || match);
  let table = 'public.sales s';
  if (/"(?:Відділ|Маршрут)"/.test(referenced)) {
    table += ' LEFT JOIN public.agents a ON TRIM(s.ta) = TRIM(a.ta)';
  }
  if (/"(?:Виробник|ТМ|Група|Підгрупа)"/.test(referenced)) {
    table += ' LEFT JOIN public.products p ON TRIM(s.product_name) = TRIM(p.product_name)';
  }
  return { table, where: translate(filter.where), params: filter.params, column: translate(requiredColumns) };
};

export const getSalesByDays = async (query) => {
  const filter = buildDailySource(query);
  const result = await laskaPool.query(buildDailySalesQuery({
    table: filter.table,
    date: 's.sale_date',
    store: `COALESCE('code:' || NULLIF(TRIM(s.store_code), ''), 'name:' || COALESCE(NULLIF(TRIM(s.store_name), ''), 'Без ТТ'))`,
    amount: 's.amount',
    weight: 'COALESCE(s.quantity, 0) * COALESCE(s.weight, 0)',
    where: filter.where,
  }), filter.params);
  return result.rows;
};

export const getSalesByDaysFilters = async (req) => {
  const fields = [ ['departments', 'department', '"Відділ"'], ['agents', 'agent', '"ТА"'], ['brands', 'brands', '"ТМ"'] ];
  const entries = await Promise.all(fields.map(async ([key, ownFilter, column]) => {
    // Remove only the UI selection, then reapply mandatory role restrictions.
    const query = { ...req.query };
    delete query[ownFilter];
    const filter = buildDailySource(getEffectiveQuery({ query, user: req.user }), column);
    const result = await laskaPool.query(
      `SELECT DISTINCT ${filter.column} AS value FROM ${filter.table} ${filter.where} ORDER BY value`, filter.params,
    );
    return [key, result.rows.map(row => row.value).filter(Boolean)];
  }));
  return Object.fromEntries(entries);
};

export const buildSalesHistory = async ({ query: rawQuery = {}, user }) => {
  const getKyivDate = () => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Kyiv',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());

    const values = Object.fromEntries(
      parts.map(({ type, value }) => [type, value]),
    );

    return `${values.year}-${values.month}-${values.day}`;
  };

  const shiftDays = (value, days) => {
    const date = new Date(`${value}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };

  const startOfWeek = (value) => {
    const date = new Date(`${value}T00:00:00Z`);
    const day = date.getUTCDay();
    date.setUTCDate(date.getUTCDate() - (day === 0 ? 6 : day - 1));
    return date.toISOString().slice(0, 10);
  };

  const shiftMonthStart = (value, months) => {
    const date = new Date(`${value.slice(0, 7)}-01T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + months);
    return date.toISOString().slice(0, 10);
  };

  const dateOnly = (value) =>
    value instanceof Date
      ? [
          value.getFullYear(),
          String(value.getMonth() + 1).padStart(2, '0'),
          String(value.getDate()).padStart(2, '0'),
        ].join('-')
      : String(value).slice(0, 10);

  const dateKey = (value) => {
    const text = String(value || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
  };

  const period = rawQuery.period || '4weeks';

  if (!['4weeks', '4months'].includes(period)) {
    throw new Error('period must be 4weeks or 4months');
  }

  const query = getEffectiveQuery({ query: rawQuery, user });
  const currentDate = dateKey(rawQuery.asOfDate) || getKyivDate();
  const periodType = period === '4weeks' ? 'week' : 'month';
  const currentWeekStart = startOfWeek(currentDate);
  const currentMonthStart = shiftMonthStart(currentDate, 0);

  const dateTo =
    periodType === 'week'
      ? shiftDays(currentWeekStart, -1)
      : shiftDays(shiftMonthStart(currentMonthStart, 1), -1);

  const dateFrom =
    periodType === 'week'
      ? shiftDays(currentWeekStart, -28)
      : shiftMonthStart(currentMonthStart, -3);

  const buildColumns = () => {
    const starts = [];
    let cursor =
      periodType === 'week' ? startOfWeek(dateTo) : shiftMonthStart(dateTo, 0);

    while (cursor >= dateFrom) {
      starts.push(cursor);
      cursor =
        periodType === 'week'
          ? shiftDays(cursor, -7)
          : shiftMonthStart(cursor, -1);
    }

    return starts.map((startDate) => {
      const endDate =
        periodType === 'week'
          ? shiftDays(startDate, 6)
          : shiftDays(shiftMonthStart(startDate, 1), -1);

      return {
        key: startDate,
        startDate,
        endDate,
        label:
          periodType === 'week'
            ? `${startDate} — ${endDate}`
            : startDate.slice(0, 7),
      };
    });
  };

  const groupingFields = [
    ...new Set(
      String(query.groupingFields || 'tm')
        .split(',')
        .map((field) => field.trim().toLowerCase())
        .filter((field) => GROUPING_FIELDS.has(field)),
    ),
  ];

  const summarizeProducts = query.summarizeProducts === true;
  const storeSearch = String(query.storeSearch || '').trim();

  const applyAllowedValues = (allowedValues, requestedValues) => {
    if (!allowedValues.length) return requestedValues;
    if (!requestedValues.length) return allowedValues;

    const requestedSet = new Set(requestedValues);
    return allowedValues.filter((value) => requestedSet.has(value));
  };

  const addFilters = (conditions, params, aliases = {}) => {
    const salesAlias = aliases.sales || 's';
    if (user?.role === ROLES.SUPERVISOR && !normalizeFilterValues(query.departments).length) conditions.push('FALSE');
    if (user?.role === ROLES.BRAND_MANAGER && !normalizeFilterValues(query.tms).length) conditions.push('FALSE');
    const productAlias = aliases.product || 'p';

    if (query.ta) {
      params.push(query.ta);
      conditions.push(`${salesAlias}.ta = $${params.length}`);
    }

    const departments = normalizeFilterValues(query.departments);
    const requestedDepartments = normalizeFilterValues(query.department);
    const departmentValues = applyAllowedValues(
      departments,
      requestedDepartments,
    );

    if (departments.length && requestedDepartments.length && !departmentValues.length) conditions.push('FALSE');
    if (departmentValues.length) {
      params.push(departmentValues);
      conditions.push(`
        EXISTS (
          SELECT 1
          FROM public.agents a_filter
          WHERE TRIM(a_filter.ta) = TRIM(${salesAlias}.ta)
            AND a_filter.department = ANY($${params.length})
        )
      `);
    }

    if (query.route) {
      params.push(query.route);
      conditions.push(`
        EXISTS (
          SELECT 1
          FROM public.agents a_route
          WHERE TRIM(a_route.ta) = TRIM(${salesAlias}.ta)
            AND a_route.route = $${params.length}
        )
      `);
    }

    if (storeSearch) {
      params.push(`%${storeSearch}%`);
      const p = `$${params.length}`;

      conditions.push(`(
        COALESCE(${salesAlias}.store_name, '') ILIKE ${p}
        OR COALESCE(${salesAlias}.store_code, '') ILIKE ${p}
      )`);
    }

    if (query.storeCode) {
      params.push(query.storeCode);
      conditions.push(`${salesAlias}.store_code = $${params.length}`);
    }

    if (query.product) {
      params.push(query.product);
      conditions.push(`${salesAlias}.product_name = $${params.length}`);
    }

    const tms = normalizeFilterValues(query.tms);
    const requestedTms = normalizeFilterValues(query.tm);
    const tmValues = applyAllowedValues(tms, requestedTms);

    if (tms.length && requestedTms.length && !tmValues.length) conditions.push('FALSE');
    if (tmValues.length) {
      params.push(tmValues);
      conditions.push(`${productAlias}.tm = ANY($${params.length})`);
    }

    if (query.group) {
      params.push(query.group);
      conditions.push(`${productAlias}.group_name = $${params.length}`);
    }

    if (query.manufacturer) {
      params.push(query.manufacturer);
      conditions.push(`${productAlias}.manufacturer = $${params.length}`);
    }

    if (query.subgroup) {
      params.push(query.subgroup);
      conditions.push(`${productAlias}.subgroup = $${params.length}`);
    }

    if (query.packing) {
      params.push(query.packing);
      conditions.push(
        `COALESCE(${productAlias}.packaging::text, '') = $${params.length}`,
      );
    }
  };

  const productGroupExpr = {
    group: `COALESCE(NULLIF(s.group_name, ''), 'Без групи')`,
    subgroup: `COALESCE(NULLIF(s.subgroup, ''), 'Без підгрупи')`,
    tm: `COALESCE(NULLIF(s.tm, ''), 'Без ТМ')`,
    packing: `COALESCE(NULLIF(s.packaging::text, ''), 'Без фасовки')`,
  };

  const catalogGroupExpr = {
    group: `COALESCE(NULLIF(TRIM(group_name), ''), 'Без групи')`,
    subgroup: `COALESCE(NULLIF(TRIM(subgroup), ''), 'Без підгрупи')`,
    tm: `COALESCE(NULLIF(TRIM(tm), ''), 'Без ТМ')`,
    packing: `COALESCE(NULLIF(TRIM(packaging::text), ''), 'Без фасовки')`,
  };

  const groupSelect = groupingFields.length
    ? `, ${groupingFields
        .map((field) =>
          summarizeProducts
            ? `${productGroupExpr[field]} AS "${field}"`
            : `MAX(${productGroupExpr[field]}) AS "${field}"`,
        )
        .join(', ')}`
    : '';

  const summaryProductExpr = groupingFields.length
    ? groupingFields
        .map((field) => productGroupExpr[field])
        .join(` || ' / ' || `)
    : `'Усього'`;

  const productSelect = summarizeProducts
    ? `
      NULL::text AS product_code,
      ${summaryProductExpr} AS product,`
    : `
      s.product_code,
      COALESCE(MAX(NULLIF(s.product_name, '')), 'Без товару') AS product,`;

  const productGroupBy = summarizeProducts
    ? groupingFields.map((field) => productGroupExpr[field])
    : ['s.product_code'];

  const mainConditions = [
    's.period_type = $1',
    "s.start_date >= date_trunc($1, $2::date)::date",
    "s.start_date <= date_trunc($1, $3::date)::date",
  ];

  const mainParams = [periodType, dateFrom, dateTo];
  addFilters(mainConditions, mainParams, { product: 's' });

  // Compatibility requests also aggregate daily rows directly. No table rebuild in a GET.
  const historyTable = `(
    SELECT d.*, $1::text AS period_type,
      date_trunc($1::text, d.sale_date::timestamp)::date AS start_date,
      CASE WHEN $1::text = 'week' THEN EXTRACT(ISOYEAR FROM d.sale_date)::int
           ELSE EXTRACT(YEAR FROM d.sale_date)::int END AS year,
      CASE WHEN $1::text = 'week' THEN EXTRACT(WEEK FROM d.sale_date)::int
           ELSE EXTRACT(MONTH FROM d.sale_date)::int END AS period_number
    FROM public.sales_history_daily d
    WHERE d.sale_date BETWEEN $2::date AND $3::date
  )`;
  const historySql = `
    SELECT
      s.store_code,
      COALESCE(MAX(NULLIF(s.store_name, '')), 'Без ТТ') AS store_name,
      ${productSelect}
      to_char(s.start_date, 'YYYY-MM-DD') AS start_date,
      s.year,
      s.period_number,
      SUM(COALESCE(s.quantity, 0)) AS quantity,
      SUM(COALESCE(s.amount, 0)) AS amount,
      SUM(COALESCE(s.weight, 0)) AS weight
      ${groupSelect}
    FROM ${historyTable} s
    WHERE ${mainConditions.join(' AND ')}
    GROUP BY
      s.store_code,
      ${[...productGroupBy, 's.start_date', 's.year', 's.period_number'].join(
        ',\n      ',
      )}
    ORDER BY store_name, product, start_date DESC
  `;

  console.time('[HISTORY] main query');
  const historyResult = await laskaPool.query(historySql, mainParams);
  console.timeEnd('[HISTORY] main query');

  const recentDateFrom = dateFrom;
  const recentDateTo = dateTo;

  const storeConditions = ['s.sale_date <= $1::date'];
  const storeParams = [dateTo];

  addFilters(storeConditions, storeParams, { product: 's' });

  storeParams.push(recentDateFrom);
  const recentFrom = `$${storeParams.length}`;

  storeParams.push(recentDateTo);
  const recentTo = `$${storeParams.length}`;

  const recentConditions = [
    `s.sale_date BETWEEN ${recentFrom}::date AND ${recentTo}::date`,
  ];
  addFilters(recentConditions, storeParams, { product: 's' });

  const storesSql = `
    WITH filtered_stores AS (
      SELECT
        s.store_code,
        MAX(NULLIF(s.store_name, '')) AS store_name
      FROM public.sales_history_daily s
      WHERE ${storeConditions.join(' AND ')}
      GROUP BY s.store_code
    ),
    recent_sales AS (
      SELECT DISTINCT
        s.store_code
      FROM public.sales_history_daily s
      WHERE ${recentConditions.join(' AND ')}
    )
    SELECT
      fs.store_code,
      COALESCE(fs.store_name, 'Без ТТ') AS store_name,
      (rs.store_code IS NOT NULL) AS has_recent_sales
    FROM filtered_stores fs
    LEFT JOIN recent_sales rs
      ON rs.store_code IS NOT DISTINCT FROM fs.store_code
    ORDER BY fs.store_name
  `;

  console.time('[HISTORY] stores query');
  const storesResult = await laskaPool.query(storesSql, storeParams);
  console.timeEnd('[HISTORY] stores query');
  const columns = buildColumns();

  const storesMap = new Map();

  for (const row of storesResult.rows) {
    const key = String(row.store_code ?? '');

    storesMap.set(key, {
      code: row.store_code ?? '',
      name: row.store_name,
      hasRecentSales: row.has_recent_sales,
      items: [],
    });
  }

  for (const row of historyResult.rows) {
    const key = String(row.store_code ?? '');

    if (!storesMap.has(key)) {
      storesMap.set(key, {
        code: row.store_code ?? '',
        name: row.store_name,
        hasRecentSales: false,
        items: [],
      });
    }

    const item = {
      product: row.product,
      productCode: row.product_code,
      startDate: dateOnly(row.start_date),
      year: row.year,
      periodNumber: row.period_number,
      quantity: Number(row.quantity || 0),
      amount: Number(row.amount || 0),
      weight: Number(row.weight || 0),
    };

    for (const field of groupingFields) {
      item[field] = row[field];
    }

    storesMap.get(key).items.push(item);
  }

  if (query.includeEmptyGroups && groupingFields.length) {
    const catalogConditions = [];
    const catalogParams = [];

    for (const [field, column] of [
      ['group', 'group_name'],
      ['subgroup', 'subgroup'],
      ['tm', 'tm'],
      ['packing', 'packaging'],
    ]) {
      if (query[field]) {
        catalogParams.push(query[field]);
        catalogConditions.push(
          `COALESCE(${column}::text, '') = $${catalogParams.length}`,
        );
      }
    }

    const catalogResult = await laskaPool.query(
      `
      SELECT DISTINCT
        ${groupingFields
          .map((field) => `${catalogGroupExpr[field]} AS "${field}"`)
          .join(', ')}
      FROM public.products
      ${catalogConditions.length ? `WHERE ${catalogConditions.join(' AND ')}` : ''}
      `,
      catalogParams,
    );

    for (const store of storesMap.values()) {
      const existingLabels = new Set(
        store.items.map((item) =>
          groupingFields.map((field) => item[field]).join('\u0001'),
        ),
      );

      for (const row of catalogResult.rows) {
        const labelKey = groupingFields.map((field) => row[field]).join('\u0001');

        if (existingLabels.has(labelKey)) continue;

        const emptyItem = {
          product: '',
          productCode: null,
          startDate: columns[0]?.key || dateFrom,
          year: null,
          periodNumber: null,
          quantity: 0,
          amount: 0,
          weight: 0,
        };

        for (const field of groupingFields) {
          emptyItem[field] = row[field];
        }

        store.items.push(emptyItem);
      }
    }
  }

  const stores = [...storesMap.values()];

  return {
    success: true,
    period,
    periodType,
    currentDate,
    dateFrom,
    dateTo,
    groupingFields,
    columns,
    summary: {
      storesCount: stores.length,
      storesWithoutSalesLast4Weeks: stores.filter(
        (store) => !store.hasRecentSales,
      ).length,
    },
    data: stores,
  };
};

export const getRouteHistoryFilters = async ({ ta, department }) => {
  const conditions = [];
  const params = [];
  if (ta) {
    params.push(ta);
    conditions.push(`ta = $${params.length}`);
  }
  if (department) {
    params.push(department);
    conditions.push(`department = $${params.length}`);
  }
  const result = await laskaPool.query(
    `
    SELECT DISTINCT department, ta AS agent, route
    FROM public.agents
    ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
    ORDER BY department, agent
  `,
    params,
  );
  return result.rows;
};

export const getFilters = async (query) => {
  const buildFilterFor = (key) => {
    const scopedQuery = { ...query };
    const keyMap = {
      departments: ['department', 'departments'],
      agents: ['ta', 'agent'],
      stores: ['store', 'stores', 'storeCode'],
      brands: ['tm', 'tms', 'brands'],
      groups: ['group', 'groups'],
      subgroups: ['subgroup', 'subgroups'],
      packings: ['packing', 'packings'],
      products: ['product', 'products'],
    };

    for (const field of keyMap[key] || [key]) {
      delete scopedQuery[field];
    }

    return buildLaskaWhere(scopedQuery);
  };

  const queries = [
    ['departments', '"Відділ"'],
    ['agents', '"ТА"'],
    ['stores', '"ТТ"'],
    ['brands', '"ТМ"'],
    ['groups', '"Група"'],
    ['subgroups', '"Підгрупа"'],
    ['packings', '"Вес"::text'],
    ['products', '"Наименование товара"'],
  ];
  const results = await Promise.all(
    queries.map(([key, column]) => {
      const filter = buildFilterFor(key);
      return laskaPool.query(
        `SELECT DISTINCT ${column} AS value FROM public.sales_laska ${filter.where} ORDER BY value`,
        filter.params,
      );
    }),
  );
  return Object.fromEntries(
    queries.map(([key], index) => [
      key,
      results[index].rows.map((row) => row.value).filter(Boolean),
    ]),
  );
};

export {
  laskaPool,
  GROUPING_FIELDS,
  STORE_EXPR,
  BRAND_EXPR,
  HISTORY_GROUP_EXPRESSIONS,
  PRODUCT_EXPR,
  numericValue,
};
