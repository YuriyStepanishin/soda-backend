import { getPool } from '../db/index.js';

const laskaPool = getPool('laska');

let ensureSalesHistoryDailyPromise;

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

export const refreshSalesHistoryDaily = async ({
  dateFrom,
  dateTo,
  dates,
  client: existingClient,
}) => {
  if (!dates?.length && (!dateFrom || !dateTo)) {
    return { refreshed: false, rows: 0 };
  }

  await ensureSalesHistoryDailyOnce();

  const client = existingClient || (await laskaPool.connect());
  const ownsClient = !existingClient;

  try {
    if (ownsClient) await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(73501421, 2)');

    const params = dates?.length ? [dates] : [dateFrom, dateTo];
    const dailyDateFilter = dates?.length
      ? `sale_date IN (
          SELECT (changed.sale_date - INTERVAL '1 day')::date
          FROM unnest($1::date[]) AS changed(sale_date)
        )`
      : 'sale_date BETWEEN $1::date AND $2::date';
    // Input dates are invoice dates; daily rows intentionally use invoice date minus one.
    // Keep the indexed sales.sale_date column unmodified in the predicate.
    const sourceDateFilter = dates?.length
      ? 's.sale_date = ANY($1::date[])'
      : 's.sale_date BETWEEN ($1::date + 1) AND ($2::date + 1)';

    await client.query(
      `
      DELETE FROM public.sales_history_daily
      WHERE ${dailyDateFilter}
      `,
      params,
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
      WHERE ${sourceDateFilter}
      GROUP BY
        (s.sale_date::date - INTERVAL '1 day')::date,
        COALESCE(NULLIF(TRIM(s.ta), ''), ''),
        COALESCE(NULLIF(TRIM(s.store_code), ''), ''),
        COALESCE(NULLIF(TRIM(s.product_code), ''), '')
      `,
      params,
    );

    if (ownsClient) await client.query('COMMIT');

    return { refreshed: true, rows: result.rowCount };
  } catch (error) {
    if (ownsClient) await client.query('ROLLBACK');
    throw error;
  } finally {
    if (ownsClient) client.release();
  }
};

