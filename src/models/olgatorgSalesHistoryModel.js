import { getPool } from '../db/index.js';
import { getAgentsByDepartments } from '../config/users_db/olgatorgUsers.js';
import { ROLES } from '../constants/roles.js';

const pool = getPool('olgatorg');

let ensureRouteTmPromise;

const STORE_EXPR = `
  COALESCE(
    NULLIF(TRIM(alt_name), ''),
    NULLIF(TRIM(outlet_name), ''),
    NULLIF(TRIM(client_name), ''),
    'Без ТТ'
  )
`;

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

const buildPeriodColumns = ({ periodType, dateFrom, dateTo }) => {
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

const dateKey = (value) => {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
};

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

const ensureRouteTm = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.sales_history_route_tm_period (
      period_type text NOT NULL,
      start_date date NOT NULL,
      year integer NOT NULL,
      period_number integer NOT NULL,
      department text,
      agent_name text NOT NULL DEFAULT '',
      store_name text NOT NULL DEFAULT '',
      tm text NOT NULL DEFAULT '',
      product_code text NOT NULL DEFAULT '',
      product_name text NOT NULL DEFAULT '',
      quantity numeric NOT NULL DEFAULT 0,
      amount numeric NOT NULL DEFAULT 0,
      weight numeric NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (
        period_type,
        start_date,
        agent_name,
        store_name,
        tm,
        product_code,
        product_name
      )
    )
  `);

  await pool.query(`
    ALTER TABLE public.sales_history_route_tm_period
      ADD COLUMN IF NOT EXISTS period_type text NOT NULL DEFAULT 'week',
      ADD COLUMN IF NOT EXISTS start_date date,
      ADD COLUMN IF NOT EXISTS year integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS period_number integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS department text,
      ADD COLUMN IF NOT EXISTS agent_name text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS store_name text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS tm text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS product_code text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS product_name text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS quantity numeric NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS amount numeric NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS weight numeric NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.sales_history_route_tm_period'::regclass
          AND conname = 'sales_history_route_tm_period_pkey'
      ) THEN
        ALTER TABLE public.sales_history_route_tm_period
          DROP CONSTRAINT sales_history_route_tm_period_pkey;
      END IF;

      ALTER TABLE public.sales_history_route_tm_period
        ADD CONSTRAINT sales_history_route_tm_period_pkey
        PRIMARY KEY (
          period_type,
          start_date,
          agent_name,
          store_name,
          tm,
          product_code,
          product_name
        );
    END $$;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_olgatorg_route_tm_lookup
      ON public.sales_history_route_tm_period (
        period_type,
        start_date,
        store_name,
        tm,
        product_name
      )
      INCLUDE (department, agent_name, product_code, quantity, amount, weight)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_olgatorg_route_tm_filters
      ON public.sales_history_route_tm_period (
        period_type,
        start_date,
        department,
        agent_name,
        tm
      )
  `);
};

const ensureRouteTmOnce = async () => {
  ensureRouteTmPromise ||= ensureRouteTm().catch((error) => {
    ensureRouteTmPromise = null;
    throw error;
  });

  return ensureRouteTmPromise;
};

export const ensureOlgatorgRouteTmHistory = ensureRouteTmOnce;

export const refreshOlgatorgRouteTmHistory = async ({
  periodType,
  dateFrom,
  dateTo,
  dates,
  client: existingClient,
}) => {
  await ensureRouteTmOnce();

  const businessSaleDate = `(sale_date::date - INTERVAL '1 day')::date`;

  const periodStart =
    periodType === 'week'
      ? `date_trunc('week', ${businessSaleDate})::date`
      : `date_trunc('month', ${businessSaleDate})::date`;

  const yearExpr =
    periodType === 'week'
      ? `EXTRACT(ISOYEAR FROM ${businessSaleDate})::int`
      : `EXTRACT(YEAR FROM ${businessSaleDate})::int`;

  const periodNumber =
    periodType === 'week'
      ? `EXTRACT(WEEK FROM ${businessSaleDate})::int`
      : `EXTRACT(MONTH FROM ${businessSaleDate})::int`;

  const client = existingClient || (await pool.connect());
  const ownsClient = !existingClient;
  let transactionStarted = false;

  try {
    if (ownsClient) {
      await client.query('BEGIN');
      transactionStarted = true;
    }

    const affectedPeriodStarts = dates
      ? `
        SELECT DISTINCT
          date_trunc($1, (affected.sale_date - INTERVAL '1 day'))::date
        FROM unnest($2::date[]) AS affected(sale_date)
      `
      : null;
    const queryParams = dates
      ? [periodType, dates]
      : [periodType, dateFrom, dateTo];
    const periodPredicate = dates
      ? `start_date IN (${affectedPeriodStarts})`
      : `start_date BETWEEN date_trunc($1, $2::date)::date
                      AND date_trunc($1, $3::date)::date`;
    const salesDatePredicate = dates
      ? `${businessSaleDate} IN (${affectedPeriodStarts})`
      : `${businessSaleDate} >= date_trunc($1, $2::date)::date
          AND ${businessSaleDate} < (
            date_trunc($1, $3::date)
            + CASE
                WHEN $1 = 'week' THEN INTERVAL '1 week'
                ELSE INTERVAL '1 month'
              END
          )::date`;

    if (dates?.length === 0) {
      if (transactionStarted) await client.query('COMMIT');
      return { refreshed: false, rows: 0 };
    }

    await client.query(
      `
      DELETE FROM public.sales_history_route_tm_period
      WHERE period_type = $1
        AND ${periodPredicate}
      `,
      queryParams,
    );

    const result = await client.query(
      `
      INSERT INTO public.sales_history_route_tm_period (
        period_type,
        start_date,
        year,
        period_number,
        department,
        agent_name,
        store_name,
        tm,
        product_code,
        product_name,
        quantity,
        amount,
        weight,
        updated_at
      )
      SELECT
        $1 AS period_type,
        ${periodStart} AS start_date,
        ${yearExpr} AS year,
        ${periodNumber} AS period_number,
        MAX(NULLIF(TRIM(department), '')) AS department,
        COALESCE(NULLIF(TRIM(agent_name), ''), '') AS agent_name,
        ${STORE_EXPR} AS store_name,
        COALESCE(NULLIF(TRIM(tm), ''), 'Без ТМ') AS tm,
        COALESCE(NULLIF(TRIM(barcode::text), ''), '') AS product_code,
        COALESCE(NULLIF(TRIM(product_name), ''), 'Без товару') AS product_name,
        SUM(COALESCE(qty, 0)) AS quantity,
        SUM(COALESCE(amount, 0)) AS amount,
        SUM(COALESCE(qty, 0) * COALESCE(weight, 0)) AS weight,
        now()
      FROM public.sales
      WHERE ${salesDatePredicate}
      GROUP BY
        ${periodStart},
        ${yearExpr},
        ${periodNumber},
        COALESCE(NULLIF(TRIM(agent_name), ''), ''),
        ${STORE_EXPR},
        COALESCE(NULLIF(TRIM(tm), ''), 'Без ТМ'),
        COALESCE(NULLIF(TRIM(barcode::text), ''), ''),
        COALESCE(NULLIF(TRIM(product_name), ''), 'Без товару')
      `,
      queryParams,
    );

    if (transactionStarted) {
      await client.query('COMMIT');
      transactionStarted = false;
    }

    return { refreshed: true, rows: result.rowCount };
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK');
    }
    throw error;
  } finally {
    if (ownsClient) {
      client.release();
    }
  }
};

const ensureRouteTmRange = async ({ periodType, dateFrom, dateTo }) => {
  await ensureRouteTmOnce();

  const result = await pool.query(
    `
    WITH source_periods AS (
      SELECT
        date_trunc(
          $1,
          (sale_date::date - INTERVAL '1 day')::date
        )::date AS start_date,
        SUM(COALESCE(qty, 0)) AS source_quantity,
        COUNT(
          DISTINCT CONCAT_WS(
            '|',
            COALESCE(NULLIF(TRIM(agent_name), ''), ''),
            ${STORE_EXPR},
            COALESCE(NULLIF(TRIM(tm), ''), 'Без ТМ'),
            COALESCE(NULLIF(TRIM(barcode::text), ''), ''),
            COALESCE(NULLIF(TRIM(product_name), ''), 'Без товару')
          )
        )::int AS source_items
      FROM public.sales
      WHERE (sale_date::date - INTERVAL '1 day')::date
        >= date_trunc($1, $2::date)::date
        AND (sale_date::date - INTERVAL '1 day')::date < (
          date_trunc($1, $3::date)
          + CASE
              WHEN $1 = 'week' THEN INTERVAL '1 week'
              ELSE INTERVAL '1 month'
            END
        )::date
      GROUP BY date_trunc(
        $1,
        (sale_date::date - INTERVAL '1 day')::date
      )::date
    ),
    target_periods AS (
      SELECT
        start_date,
        SUM(quantity) AS target_quantity,
        COUNT(
          DISTINCT CONCAT_WS(
            '|',
            agent_name,
            store_name,
            tm,
            product_code,
            product_name
          )
        )::int AS target_items
      FROM public.sales_history_route_tm_period
      WHERE period_type = $1
        AND start_date BETWEEN date_trunc($1, $2::date)::date
                           AND date_trunc($1, $3::date)::date
      GROUP BY start_date
    )
    SELECT
      COUNT(*) FILTER (WHERE tp.start_date IS NULL)::int AS missing_periods,
      COUNT(*) FILTER (
        WHERE tp.start_date IS NOT NULL
          AND COALESCE(sp.source_quantity, 0)
            <> COALESCE(tp.target_quantity, 0)
      )::int AS mismatched_periods,
      COUNT(*) FILTER (
        WHERE tp.start_date IS NOT NULL
          AND COALESCE(sp.source_items, 0)
            <> COALESCE(tp.target_items, 0)
      )::int AS mismatched_items
    FROM source_periods sp
    LEFT JOIN target_periods tp
      ON tp.start_date = sp.start_date
    `,
    [periodType, dateFrom, dateTo],
  );

  if (
    (result.rows[0]?.missing_periods || 0) === 0 &&
    (result.rows[0]?.mismatched_periods || 0) === 0 &&
    (result.rows[0]?.mismatched_items || 0) === 0
  ) {
    return { refreshed: false };
  }

  return refreshOlgatorgRouteTmHistory({
    periodType,
    dateFrom,
    dateTo,
  });
};

const addRoleFilters = (conditions, params, user) => {
  switch (user.role) {
    case ROLES.AGENT:
      params.push(user.representative);
      conditions.push(`agent_name = $${params.length}`);
      break;

    case ROLES.SUPERVISOR:
      params.push(getAgentsByDepartments(user.departments || []));
      conditions.push(`agent_name = ANY($${params.length})`);
      break;

    case ROLES.BRAND_MANAGER:
      params.push(user.brands || []);
      conditions.push(`tm = ANY($${params.length})`);
      break;

    default:
      break;
  }
};

const addRequestFilters = (conditions, params, query) => {
  const departments = normalizeFilterValues(query.department);
  if (departments.length) {
    params.push(departments);
    conditions.push(`department = ANY($${params.length})`);
  }

  const agents = normalizeFilterValues(query.agent ?? query.ta);
  if (agents.length) {
    params.push(agents);
    conditions.push(`agent_name = ANY($${params.length})`);
  }

  const stores = normalizeFilterValues(query.stores ?? query.store);
  if (stores.length) {
    params.push(stores);
    conditions.push(`store_name = ANY($${params.length})`);
  }

  const brands = normalizeFilterValues(query.brands ?? query.tm);
  if (brands.length) {
    params.push(brands);
    conditions.push(`tm = ANY($${params.length})`);
  }

  const storeSearch =
    typeof query.storeSearch === 'string' ? query.storeSearch.trim() : '';
  if (storeSearch) {
    params.push(`%${storeSearch}%`);
    conditions.push(`store_name ILIKE $${params.length}`);
  }
};

export const buildOlgatorgRouteHistory = async ({
  query: rawQuery = {},
  user,
}) => {
  const period = rawQuery.period || '4weeks';
  const periodType = period === '4months' ? 'month' : 'week';
  const currentDate = dateKey(rawQuery.asOfDate) || getKyivDate();
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

  await ensureRouteTmRange({ periodType, dateFrom, dateTo });

  const conditions = [
    'period_type = $1',
    "start_date >= date_trunc($1, $2::date)::date",
    "start_date <= date_trunc($1, $3::date)::date",
  ];
  const params = [periodType, dateFrom, dateTo];

  addRoleFilters(conditions, params, user);
  addRequestFilters(conditions, params, rawQuery);

  const historyResult = await pool.query(
    `
    SELECT
      store_name,
      tm,
      product_code,
      product_name,
      to_char(start_date, 'YYYY-MM-DD') AS start_date,
      year,
      period_number,
      SUM(quantity) AS quantity,
      SUM(amount) AS amount,
      SUM(weight) AS weight
    FROM public.sales_history_route_tm_period
    WHERE ${conditions.join(' AND ')}
    GROUP BY
      store_name,
      tm,
      product_code,
      product_name,
      start_date,
      year,
      period_number
    ORDER BY store_name, tm, product_name, start_date DESC
    `,
    params,
  );

  const storeConditions = ['period_type = $1', 'start_date <= $2::date'];
  const storeParams = [periodType, dateTo];
  addRoleFilters(storeConditions, storeParams, user);
  addRequestFilters(storeConditions, storeParams, rawQuery);

  storeParams.push(dateFrom);
  const recentFrom = `$${storeParams.length}`;

  storeParams.push(dateTo);
  const recentTo = `$${storeParams.length}`;

  const recentConditions = [
    'period_type = $1',
    `start_date BETWEEN ${recentFrom}::date AND ${recentTo}::date`,
  ];
  addRoleFilters(recentConditions, storeParams, user);
  addRequestFilters(recentConditions, storeParams, rawQuery);

  const storesResult = await pool.query(
    `
    WITH filtered_stores AS (
      SELECT
        store_name
      FROM public.sales_history_route_tm_period
      WHERE ${storeConditions.join(' AND ')}
      GROUP BY store_name
    ),
    recent_sales AS (
      SELECT DISTINCT
        store_name
      FROM public.sales_history_route_tm_period
      WHERE ${recentConditions.join(' AND ')}
    )
    SELECT
      fs.store_name,
      (rs.store_name IS NOT NULL) AS has_recent_sales
    FROM filtered_stores fs
    LEFT JOIN recent_sales rs
      ON rs.store_name IS NOT DISTINCT FROM fs.store_name
    ORDER BY fs.store_name
    `,
    storeParams,
  );

  const columns = buildPeriodColumns({ periodType, dateFrom, dateTo });

  const storesMap = new Map();

  for (const row of storesResult.rows) {
    storesMap.set(row.store_name, {
      code: row.store_name,
      name: row.store_name,
      hasRecentSales: row.has_recent_sales,
      items: [],
    });
  }

  for (const row of historyResult.rows) {
    if (!storesMap.has(row.store_name)) {
      storesMap.set(row.store_name, {
        code: row.store_name,
        name: row.store_name,
        hasRecentSales: true,
        items: [],
      });
    }

    storesMap.get(row.store_name).items.push({
      product: row.product_name,
      productCode: row.product_code || null,
      tm: row.tm,
      startDate: dateOnly(row.start_date),
      year: row.year,
      periodNumber: row.period_number,
      quantity: Number(row.quantity || 0),
      amount: Number(row.amount || 0),
      weight: Number(row.weight || 0),
    });
  }

  const catalogTmResult = await pool.query(`
    SELECT DISTINCT COALESCE(NULLIF(TRIM(tm), ''), 'Без ТМ') AS tm
    FROM public.prices
    ORDER BY tm
  `);

  const catalogTms = catalogTmResult.rows
    .map((row) => row.tm)
    .filter(Boolean);

  for (const store of storesMap.values()) {
    const usedTms = new Set(
      store.items.map((item) => String(item.tm || '').trim()).filter(Boolean),
    );

    for (const tm of catalogTms) {
      if (usedTms.has(tm)) continue;

      store.items.push({
        product: '',
        productCode: null,
        tm,
        startDate: null,
        year: null,
        periodNumber: null,
        quantity: 0,
        amount: 0,
        weight: 0,
      });
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
    groupingFields: ['tm'],
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

export const getOlgatorgRouteHistoryFilters = async (user) => {
  const roleConditions = [];
  const params = [];
  addRoleFilters(roleConditions, params, user);

  const result = await pool.query(
    `
    SELECT DISTINCT department, agent_name AS agent
    FROM public.sales_history_route_tm_period
    ${roleConditions.length ? `WHERE ${roleConditions.join(' AND ')}` : ''}
    ORDER BY department, agent
    `,
    params,
  );

  return result.rows;
};
