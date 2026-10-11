import { getPool } from '../db/index.js';

const laskaPool = getPool('laska');

let ensureSalesHistoryDailyPromise;
let ensureSalesHistoryPeriodPromise;
let ensureSalesHistoryRouteTmPromise;

const ensureSalesHistoryDaily = async () => {
  await laskaPool.query(`
    CREATE TABLE IF NOT EXISTS public.sales_history_daily (
      sale_date date NOT NULL,
      ta text NOT NULL DEFAULT '',
      store_code text NOT NULL DEFAULT '',
      store_name text,
      product_code text NOT NULL DEFAULT '',
      product_name text NOT NULL DEFAULT '',
      manufacturer text,
      tm text,
      group_name text,
      subgroup text,
      packaging text,
      quantity numeric NOT NULL DEFAULT 0,
      amount numeric NOT NULL DEFAULT 0,
      weight numeric NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (sale_date, ta, store_code, product_code)
    )
  `);

  await laskaPool.query(`
    ALTER TABLE public.sales_history_daily
      ADD COLUMN IF NOT EXISTS sale_date date,
      ADD COLUMN IF NOT EXISTS ta text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS store_code text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS store_name text,
      ADD COLUMN IF NOT EXISTS product_code text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS product_name text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS manufacturer text,
      ADD COLUMN IF NOT EXISTS tm text,
      ADD COLUMN IF NOT EXISTS group_name text,
      ADD COLUMN IF NOT EXISTS subgroup text,
      ADD COLUMN IF NOT EXISTS packaging text,
      ADD COLUMN IF NOT EXISTS quantity numeric NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS amount numeric NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS weight numeric NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()
  `);

  await laskaPool.query(`
    CREATE INDEX IF NOT EXISTS idx_sales_history_daily_date
      ON public.sales_history_daily (sale_date)
  `);

  await laskaPool.query(`
    CREATE INDEX IF NOT EXISTS idx_sales_history_daily_store_date
      ON public.sales_history_daily (store_code, sale_date)
  `);

  await laskaPool.query(`
    CREATE INDEX IF NOT EXISTS idx_sales_history_daily_ta_date
      ON public.sales_history_daily (ta, sale_date)
  `);

  await laskaPool.query(`
    CREATE INDEX IF NOT EXISTS idx_sales_history_daily_product_filters
      ON public.sales_history_daily (tm, group_name, subgroup, packaging)
  `);

  await laskaPool.query(`
    CREATE INDEX IF NOT EXISTS idx_sales_history_daily_period_lookup
      ON public.sales_history_daily (sale_date, store_code, product_code)
      INCLUDE (
        store_name,
        product_name,
        tm,
        group_name,
        subgroup,
        packaging,
        quantity,
        amount,
        weight
      )
  `);

  await laskaPool.query(`
    CREATE INDEX IF NOT EXISTS idx_sales_history_daily_store_lookup
      ON public.sales_history_daily (store_code, sale_date)
      INCLUDE (store_name)
  `);
};

const ensureSalesHistoryDailyOnce = async () => {
  ensureSalesHistoryDailyPromise ||= ensureSalesHistoryDaily().catch((error) => {
    ensureSalesHistoryDailyPromise = null;
    throw error;
  });

  return ensureSalesHistoryDailyPromise;
};

const ensureSalesHistoryPeriod = async () => {
  await laskaPool.query(`
    CREATE TABLE IF NOT EXISTS public.sales_history_period (
      period_type text NOT NULL,
      start_date date NOT NULL,
      year integer NOT NULL,
      period_number integer NOT NULL,
      ta text NOT NULL DEFAULT '',
      store_code text NOT NULL DEFAULT '',
      store_name text,
      product_code text NOT NULL DEFAULT '',
      product_name text NOT NULL DEFAULT '',
      manufacturer text,
      tm text,
      group_name text,
      subgroup text,
      packaging text,
      quantity numeric NOT NULL DEFAULT 0,
      amount numeric NOT NULL DEFAULT 0,
      weight numeric NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (
        period_type,
        start_date,
        ta,
        store_code,
        product_code
      )
    )
  `);

  await laskaPool.query(`
    ALTER TABLE public.sales_history_period
      ADD COLUMN IF NOT EXISTS period_type text NOT NULL DEFAULT 'week',
      ADD COLUMN IF NOT EXISTS start_date date,
      ADD COLUMN IF NOT EXISTS year integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS period_number integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS ta text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS store_code text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS store_name text,
      ADD COLUMN IF NOT EXISTS product_code text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS product_name text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS manufacturer text,
      ADD COLUMN IF NOT EXISTS tm text,
      ADD COLUMN IF NOT EXISTS group_name text,
      ADD COLUMN IF NOT EXISTS subgroup text,
      ADD COLUMN IF NOT EXISTS packaging text,
      ADD COLUMN IF NOT EXISTS quantity numeric NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS amount numeric NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS weight numeric NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()
  `);

  await laskaPool.query(`
    CREATE INDEX IF NOT EXISTS idx_sales_history_period_lookup
      ON public.sales_history_period (
        period_type,
        start_date,
        store_code,
        product_code
      )
      INCLUDE (
        store_name,
        product_name,
        tm,
        group_name,
        subgroup,
        packaging,
        quantity,
        amount,
        weight
      )
  `);

  await laskaPool.query(`
    CREATE INDEX IF NOT EXISTS idx_sales_history_period_filters
      ON public.sales_history_period (
        period_type,
        start_date,
        ta,
        tm,
        group_name,
        subgroup,
        packaging
      )
  `);
};

const ensureSalesHistoryPeriodOnce = async () => {
  ensureSalesHistoryPeriodPromise ||= ensureSalesHistoryPeriod().catch(
    (error) => {
      ensureSalesHistoryPeriodPromise = null;
      throw error;
    },
  );

  return ensureSalesHistoryPeriodPromise;
};

const ensureSalesHistoryRouteTm = async () => {
  await laskaPool.query(`
    CREATE TABLE IF NOT EXISTS public.sales_history_route_tm_period (
      period_type text NOT NULL,
      start_date date NOT NULL,
      year integer NOT NULL,
      period_number integer NOT NULL,
      ta text NOT NULL DEFAULT '',
      store_code text NOT NULL DEFAULT '',
      store_name text,
      tm text NOT NULL DEFAULT '',
      quantity numeric NOT NULL DEFAULT 0,
      amount numeric NOT NULL DEFAULT 0,
      weight numeric NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (period_type, start_date, ta, store_code, tm)
    )
  `);

  await laskaPool.query(`
    ALTER TABLE public.sales_history_route_tm_period
      ADD COLUMN IF NOT EXISTS period_type text NOT NULL DEFAULT 'week',
      ADD COLUMN IF NOT EXISTS start_date date,
      ADD COLUMN IF NOT EXISTS year integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS period_number integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS ta text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS store_code text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS store_name text,
      ADD COLUMN IF NOT EXISTS tm text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS quantity numeric NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS amount numeric NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS weight numeric NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()
  `);

  await laskaPool.query(`
    CREATE INDEX IF NOT EXISTS idx_sales_history_route_tm_lookup
      ON public.sales_history_route_tm_period (
        period_type,
        start_date,
        store_code,
        tm
      )
      INCLUDE (store_name, quantity, amount, weight)
  `);

  await laskaPool.query(`
    CREATE INDEX IF NOT EXISTS idx_sales_history_route_tm_filters
      ON public.sales_history_route_tm_period (period_type, start_date, ta, tm)
  `);
};

const ensureSalesHistoryRouteTmOnce = async () => {
  ensureSalesHistoryRouteTmPromise ||= ensureSalesHistoryRouteTm().catch(
    (error) => {
      ensureSalesHistoryRouteTmPromise = null;
      throw error;
    },
  );

  return ensureSalesHistoryRouteTmPromise;
};

export const refreshSalesHistoryDaily = async ({ dateFrom, dateTo }) => {
  if (!dateFrom || !dateTo) {
    return { refreshed: false, rows: 0 };
  }

  await ensureSalesHistoryDailyOnce();
  await ensureSalesHistoryPeriodOnce();
  await ensureSalesHistoryRouteTmOnce();

  const client = await laskaPool.connect();

  try {
    await client.query('BEGIN');

    await client.query(
      `
      DELETE FROM public.sales_history_daily
      WHERE sale_date BETWEEN $1::date AND $2::date
      `,
      [dateFrom, dateTo],
    );

    await client.query(
      `
      DELETE FROM public.sales_history_period
      WHERE start_date BETWEEN date_trunc('week', $1::date)::date
                           AND date_trunc('month', $2::date)::date
      `,
      [dateFrom, dateTo],
    );

    await client.query(
      `
      DELETE FROM public.sales_history_route_tm_period
      WHERE start_date BETWEEN date_trunc('week', $1::date)::date
                           AND date_trunc('month', $2::date)::date
      `,
      [dateFrom, dateTo],
    );

    const result = await client.query(
      `
      INSERT INTO public.sales_history_daily (
        sale_date,
        ta,
        store_code,
        store_name,
        product_code,
        product_name,
        manufacturer,
        tm,
        group_name,
        subgroup,
        packaging,
        quantity,
        amount,
        weight,
        updated_at
      )
      SELECT
        (s.sale_date::date - INTERVAL '1 day')::date AS sale_date,
        COALESCE(NULLIF(TRIM(s.ta), ''), '') AS ta,
        COALESCE(NULLIF(TRIM(s.store_code), ''), '') AS store_code,
        MAX(NULLIF(TRIM(s.store_name), '')) AS store_name,
        COALESCE(NULLIF(TRIM(s.product_code), ''), '') AS product_code,
        MAX(COALESCE(NULLIF(TRIM(s.product_name), ''), 'Без товару')) AS product_name,
        MAX(NULLIF(TRIM(p.manufacturer), '')) AS manufacturer,
        MAX(NULLIF(TRIM(p.tm), '')) AS tm,
        MAX(NULLIF(TRIM(p.group_name), '')) AS group_name,
        MAX(NULLIF(TRIM(p.subgroup), '')) AS subgroup,
        MAX(NULLIF(TRIM(p.packaging::text), '')) AS packaging,
        SUM(COALESCE(s.quantity, 0)) AS quantity,
        SUM(COALESCE(s.amount, 0)) AS amount,
        SUM(COALESCE(s.quantity, 0) * COALESCE(s.weight, 0)) AS weight,
        now()
      FROM public.sales s
      LEFT JOIN public.products p
        ON TRIM(p.product_name) = TRIM(s.product_name)
      WHERE (s.sale_date::date - INTERVAL '1 day')::date
        BETWEEN $1::date AND $2::date
      GROUP BY
        (s.sale_date::date - INTERVAL '1 day')::date,
        COALESCE(NULLIF(TRIM(s.ta), ''), ''),
        COALESCE(NULLIF(TRIM(s.store_code), ''), ''),
        COALESCE(NULLIF(TRIM(s.product_code), ''), '')
      `,
      [dateFrom, dateTo],
    );

    await client.query('COMMIT');

    return { refreshed: true, rows: result.rowCount };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const refreshSalesHistoryPeriod = async ({
  periodType,
  dateFrom,
  dateTo,
}) => {
  if (!['week', 'month'].includes(periodType) || !dateFrom || !dateTo) {
    return { refreshed: false, rows: 0 };
  }

  await ensureSalesHistoryDailyRange({ dateFrom, dateTo });
  await ensureSalesHistoryPeriodOnce();
  await ensureSalesHistoryRouteTmOnce();

  const periodStart =
    periodType === 'week'
      ? `date_trunc('week', sale_date)::date`
      : `date_trunc('month', sale_date)::date`;

  const yearExpr =
    periodType === 'week'
      ? `EXTRACT(ISOYEAR FROM sale_date)::int`
      : `EXTRACT(YEAR FROM sale_date)::int`;

  const periodNumber =
    periodType === 'week'
      ? `EXTRACT(WEEK FROM sale_date)::int`
      : `EXTRACT(MONTH FROM sale_date)::int`;

  const client = await laskaPool.connect();

  try {
    await client.query('BEGIN');

    await client.query(
      `
      DELETE FROM public.sales_history_period
      WHERE period_type = $1
        AND start_date BETWEEN date_trunc($1, $2::date)::date
                           AND date_trunc($1, $3::date)::date
      `,
      [periodType, dateFrom, dateTo],
    );

    const result = await client.query(
      `
      INSERT INTO public.sales_history_period (
        period_type,
        start_date,
        year,
        period_number,
        ta,
        store_code,
        store_name,
        product_code,
        product_name,
        manufacturer,
        tm,
        group_name,
        subgroup,
        packaging,
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
        ta,
        store_code,
        MAX(store_name) AS store_name,
        product_code,
        MAX(product_name) AS product_name,
        MAX(manufacturer) AS manufacturer,
        MAX(tm) AS tm,
        MAX(group_name) AS group_name,
        MAX(subgroup) AS subgroup,
        MAX(packaging) AS packaging,
        SUM(quantity) AS quantity,
        SUM(amount) AS amount,
        SUM(weight) AS weight,
        now()
      FROM public.sales_history_daily
      WHERE sale_date BETWEEN $2::date AND $3::date
      GROUP BY
        ${periodStart},
        ${yearExpr},
        ${periodNumber},
        ta,
        store_code,
        product_code
      `,
      [periodType, dateFrom, dateTo],
    );

    await client.query(
      `
      DELETE FROM public.sales_history_route_tm_period
      WHERE period_type = $1
        AND start_date BETWEEN date_trunc($1, $2::date)::date
                           AND date_trunc($1, $3::date)::date
      `,
      [periodType, dateFrom, dateTo],
    );

    await client.query(
      `
      INSERT INTO public.sales_history_route_tm_period (
        period_type,
        start_date,
        year,
        period_number,
        ta,
        store_code,
        store_name,
        tm,
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
        ta,
        store_code,
        MAX(store_name) AS store_name,
        COALESCE(NULLIF(tm, ''), 'Без ТМ') AS tm,
        SUM(quantity) AS quantity,
        SUM(amount) AS amount,
        SUM(weight) AS weight,
        now()
      FROM public.sales_history_daily
      WHERE sale_date BETWEEN $2::date AND $3::date
      GROUP BY
        ${periodStart},
        ${yearExpr},
        ${periodNumber},
        ta,
        store_code,
        COALESCE(NULLIF(tm, ''), 'Без ТМ')
      `,
      [periodType, dateFrom, dateTo],
    );

    await client.query('COMMIT');

    return { refreshed: true, rows: result.rowCount };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const ensureSalesHistoryPeriodRange = async ({
  periodType,
  dateFrom,
  dateTo,
}) => {
  const dailyResult = await ensureSalesHistoryDailyRange({ dateFrom, dateTo });
  await ensureSalesHistoryPeriodOnce();

  const result = await laskaPool.query(
    `
    WITH source_periods AS (
      SELECT
        date_trunc($1, sale_date)::date AS start_date,
        SUM(quantity) AS source_quantity
      FROM public.sales_history_daily
      WHERE sale_date BETWEEN $2::date AND $3::date
      GROUP BY date_trunc($1, sale_date)::date
    ),
    target_periods AS (
      SELECT
        start_date,
        SUM(quantity) AS target_quantity
      FROM public.sales_history_period
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
      )::int AS mismatched_periods
    FROM source_periods sp
    LEFT JOIN target_periods tp
      ON tp.start_date = sp.start_date
    `,
    [periodType, dateFrom, dateTo],
  );

  if (
    !dailyResult.refreshed &&
    (result.rows[0]?.missing_periods || 0) === 0 &&
    (result.rows[0]?.mismatched_periods || 0) === 0
  ) {
    return { refreshed: false };
  }

  return refreshSalesHistoryPeriod({
    periodType,
    dateFrom,
    dateTo,
  });
};

export const ensureSalesHistoryRouteTmRange = async ({
  periodType,
  dateFrom,
  dateTo,
}) => {
  const periodResult = await ensureSalesHistoryPeriodRange({
    periodType,
    dateFrom,
    dateTo,
  });
  await ensureSalesHistoryRouteTmOnce();

  const result = await laskaPool.query(
    `
    WITH source_periods AS (
      SELECT
        start_date,
        SUM(quantity) AS source_quantity
      FROM public.sales_history_period
      WHERE period_type = $1
        AND start_date BETWEEN date_trunc($1, $2::date)::date
                           AND date_trunc($1, $3::date)::date
      GROUP BY start_date
    ),
    target_periods AS (
      SELECT
        start_date,
        SUM(quantity) AS target_quantity
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
      )::int AS mismatched_periods
    FROM source_periods sp
    LEFT JOIN target_periods tp
      ON tp.start_date = sp.start_date
    `,
    [periodType, dateFrom, dateTo],
  );

  if (
    !periodResult.refreshed &&
    (result.rows[0]?.missing_periods || 0) === 0 &&
    (result.rows[0]?.mismatched_periods || 0) === 0
  ) {
    return { refreshed: false };
  }

  return refreshSalesHistoryPeriod({
    periodType,
    dateFrom,
    dateTo,
  });
};

export const ensureSalesHistoryDailyRange = async ({ dateFrom, dateTo }) => {
  await ensureSalesHistoryDailyOnce();

  const result = await laskaPool.query(
    `
    WITH source_dates AS (
      SELECT
        (sale_date::date - INTERVAL '1 day')::date AS sale_date,
        SUM(COALESCE(quantity, 0)) AS source_quantity
      FROM public.sales
      WHERE (sale_date::date - INTERVAL '1 day')::date
        BETWEEN $1::date AND $2::date
      GROUP BY (sale_date::date - INTERVAL '1 day')::date
    ),
    target_dates AS (
      SELECT
        sale_date,
        SUM(quantity) AS target_quantity,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (
          WHERE tm IS NOT NULL
             OR group_name IS NOT NULL
             OR subgroup IS NOT NULL
             OR packaging IS NOT NULL
        )::int AS with_metadata
      FROM public.sales_history_daily
      WHERE sale_date BETWEEN $1::date AND $2::date
      GROUP BY sale_date
    )
    SELECT
      COUNT(*)::int AS source_dates,
      COUNT(*) FILTER (WHERE td.sale_date IS NULL)::int AS missing_dates,
      COUNT(*) FILTER (
        WHERE td.total > 0
          AND td.with_metadata = 0
      )::int AS dates_without_metadata,
      COUNT(*) FILTER (
        WHERE td.sale_date IS NOT NULL
          AND COALESCE(sd.source_quantity, 0)
            <> COALESCE(td.target_quantity, 0)
      )::int AS mismatched_dates
    FROM source_dates sd
    LEFT JOIN target_dates td
      ON td.sale_date = sd.sale_date
    `,
    [dateFrom, dateTo],
  );

  const sourceDates = result.rows[0]?.source_dates || 0;
  const missingDates = result.rows[0]?.missing_dates || 0;
  const datesWithoutMetadata = result.rows[0]?.dates_without_metadata || 0;
  const mismatchedDates = result.rows[0]?.mismatched_dates || 0;

  if (
    sourceDates === 0 ||
    (missingDates === 0 &&
      datesWithoutMetadata === 0 &&
      mismatchedDates === 0)
  ) {
    return { refreshed: false };
  }

  return refreshSalesHistoryDaily({ dateFrom, dateTo });
};
