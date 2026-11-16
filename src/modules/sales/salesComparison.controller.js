import { getSalesOperation } from './sales.service.js';

const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const metrics = ['quantity', 'weight', 'amount', 'sku', 'stores', 'vmd'];
const rowKey = (row, fields) => fields.length && row.dimensions
  ? JSON.stringify(fields.slice(0, (row.level ?? 0) + 1).map(field => [field, row.dimensions[field] ?? null]))
  : String(row.id);

function mergePeriods(first, second, fields) {
  const a = new Map(first.rows.map(row => [rowKey(row, fields), row]));
  const b = new Map(second.rows.map(row => [rowKey(row, fields), row]));
  const keys = [...new Set([...a.keys(), ...b.keys()])];
  const calculate = (left, right) => Object.fromEntries(metrics.map(metric => {
    if (metric === 'vmd' && (left?.vmd == null || right?.vmd == null)) return [metric, { first: left?.vmd ?? null, second: right?.vmd ?? null, difference: null, percent: null }];
    const one = Number(left?.[metric] ?? 0), two = Number(right?.[metric] ?? 0);
    return [metric, { first: one, second: two, difference: one - two, percent: two === 0 ? null : (one - two) / Math.abs(two) * 100 }];
  }));
  return {
    success: true, reportBy: first.reportBy,
    first, second,
    rows: keys.map(key => ({
      key, label: a.get(key)?.label ?? b.get(key)?.label,
      dimensions: a.get(key)?.dimensions ?? b.get(key)?.dimensions,
      level: a.get(key)?.level ?? b.get(key)?.level,
      values: calculate(a.get(key), b.get(key)),
    })),
    totals: calculate(first.totals, second.totals),
  };
}

const runReport = async (handler, req, query) => {
  let status = 200;
  let payload;
  const response = {
    status(code) { status = code; return this; },
    json(body) { payload = body; return this; },
  };
  await handler({ ...req, query }, response);
  if (status !== 200 || !payload || payload.success === false) {
    const error = new Error(payload?.message || 'Unable to build sales comparison');
    error.status = status === 200 ? 500 : status;
    throw error;
  }
  return payload;
};

export const getSalesComparison = async (req, res, next) => {
  const { dateFrom, dateTo, compareDateFrom, compareDateTo } = req.query;
  if (![dateFrom, dateTo, compareDateFrom, compareDateTo].every(validDate)
    || dateFrom > dateTo || compareDateFrom > compareDateTo) {
    return res.status(400).json({ success: false, message: 'Two valid YYYY-MM-DD date ranges are required.' });
  }
  const handler = getSalesOperation(req.salesTenant, 'report');
  if (!handler) return res.status(501).json({ success: false, message: 'Sales comparison is unavailable for this company.' });
  try {
    const firstQuery = { ...req.query, dateFrom, dateTo };
    delete firstQuery.compareDateFrom;
    delete firstQuery.compareDateTo;
    const secondQuery = { ...firstQuery, dateFrom: compareDateFrom, dateTo: compareDateTo };
    const [first, second] = await Promise.all([
      runReport(handler, req, firstQuery),
      runReport(handler, req, secondQuery),
    ]);
    const fields = String(req.query.reportBy || 'brand').split(',').map(item => item.trim()).filter(Boolean);
    return res.json(mergePeriods(first, second, fields));
  } catch (error) {
    if (error.status && error.status < 500) return res.status(error.status).json({ success: false, message: error.message });
    return next(error);
  }
};
