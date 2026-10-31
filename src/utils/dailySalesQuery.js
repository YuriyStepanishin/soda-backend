// Expressions are supplied only by the two internal sales adapters.
export const buildDailySalesQuery = ({ table, date, store, amount, weight, where = '' }) => `
  WITH daily_store AS (
    SELECT ${date} AS sale_date, ${store} AS store_key,
           SUM(${amount}) AS store_amount,
           SUM(${weight}) AS store_weight
    FROM ${table} ${where}
    GROUP BY ${date}, ${store}
  )
  SELECT TO_CHAR(sale_date, 'YYYY-MM-DD') AS date,
         EXTRACT(ISOYEAR FROM sale_date)::int AS week_year,
         EXTRACT(WEEK FROM sale_date)::int AS week_number,
         ROUND(COALESCE(SUM(store_amount), 0)::numeric, 2) AS amount,
         ROUND(COALESCE(SUM(store_weight), 0)::numeric, 2) AS weight,
         COUNT(*)::int AS "storesCount",
         COUNT(*) FILTER (WHERE store_amount >= 500)::int AS tt500
  FROM daily_store
  GROUP BY sale_date
  ORDER BY sale_date DESC
`;

export const validateDailyDateRange = ({ dateFrom, dateTo }) => {
  const valid = (value) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  if ((dateFrom !== undefined && !valid(dateFrom)) || (dateTo !== undefined && !valid(dateTo))) {
    return 'Dates must be valid YYYY-MM-DD values';
  }
  return dateFrom && dateTo && dateFrom > dateTo ? 'dateFrom must be less than or equal to dateTo' : null;
};
