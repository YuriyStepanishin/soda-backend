
import { ROLES } from '../constants/roles.js';

const inputError = (message) => Object.assign(new Error(message), { status: 400 });

const fields = {
  group: ['group_name', 'Без групи'],
  subgroup: ['subgroup', 'Без підгрупи'],
  tm: ['tm', 'Без ТМ'],
  packing: ['packaging', 'Без фасовки'],
};

const values = (value) => (Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [])
  .map((item) => String(item).trim()).filter(Boolean);

const shiftDays = (value, count) => {
  const date = new Date(value + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
};

const monthStart = (value, count = 0) => {
  const date = new Date(value.slice(0, 7) + '-01T00:00:00Z');
  date.setUTCMonth(date.getUTCMonth() + count);
  return date.toISOString().slice(0, 10);
};

const kyivDate = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const date = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return date.year + '-' + date.month + '-' + date.day;
};

export const createRouteHistoryPlan = ({ query = {}, user } = {}) => {
  if (!['stores', 'details'].includes(query.view)) throw inputError('view must be stores or details');
  const period = query.period || '4weeks';
  if (!['4weeks', '4months'].includes(period)) throw inputError('period must be 4weeks or 4months');
  const currentDate = query.asOfDate || kyivDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(currentDate) ||
      Number.isNaN(Date.parse(currentDate + 'T00:00:00Z')) ||
      new Date(currentDate + 'T00:00:00Z').toISOString().slice(0, 10) !== currentDate) {
    throw inputError('asOfDate must be a valid YYYY-MM-DD date');
  }

  const periodType = period === '4weeks' ? 'week' : 'month';
  const dayOfWeek = new Date(currentDate + 'T00:00:00Z').getUTCDay() || 7;
  const weekStart = shiftDays(currentDate, 1 - dayOfWeek);
  const dateFrom = periodType === 'week' ? shiftDays(weekStart, -28) : monthStart(currentDate, -3);
  const dateTo = periodType === 'week' ? shiftDays(weekStart, -1) : shiftDays(monthStart(currentDate, 1), -1);
  const groupingFields = [...new Set(values(query.groupingFields || 'tm'))];
  if (!groupingFields.length || groupingFields.some((field) => !fields[field])) {
    throw inputError('Invalid groupingFields');
  }
  if (query.view === 'details' && (typeof query.storeCode !== 'string' || !query.storeCode.trim())) {
    throw inputError('storeCode is required for details');
  }

  const columns = Array.from({ length: 4 }, (_, index) => {
    const startDate = periodType === 'week'
      ? shiftDays(weekStart, -7 * (index + 1)) : monthStart(currentDate, -index);
    const endDate = periodType === 'week' ? shiftDays(startDate, 6) : shiftDays(monthStart(startDate, 1), -1);
    return { key: startDate, startDate, endDate,
      label: periodType === 'week' ? startDate + ' — ' + endDate : startDate.slice(0, 7) };
  });

  const allowedDepartments = user?.role === ROLES.SUPERVISOR
    ? values(user.departments) : values(query.departments);
  const allowedTms = user?.role === ROLES.BRAND_MANAGER ? values(user.brands) : values(query.tms);
  const requestedDepartments = values(query.department);
  const requestedTms = values(query.tm);
  const intersect = (allowed, requested) => allowed.length
    ? requested.length ? allowed.filter((value) => requested.includes(value)) : allowed
    : requested;
  const departments = intersect(allowedDepartments, requestedDepartments);
  const tms = intersect(allowedTms, requestedTms);
  const deniedDepartments = (user?.role === ROLES.SUPERVISOR && !allowedDepartments.length) ||
    (allowedDepartments.length && requestedDepartments.length && !departments.length);
  const deniedTms = (user?.role === ROLES.BRAND_MANAGER && !allowedTms.length) ||
    (allowedTms.length && requestedTms.length && !tms.length);
  const agents = user?.role === ROLES.AGENT ? values(user.representative) : values(query.ta || query.agent);
  const deniedAgent = user?.role === ROLES.AGENT && !agents.length;

  const scopedFilters = (params, conditions, { catalog = false, agentTable = false } = {}) => {
    const add = (expression, list) => {
      if (!list.length) return;
      params.push(list);
      conditions.push(expression + ' = ANY($' + params.length + '::text[])');
    };
    if (deniedDepartments || deniedTms || deniedAgent) conditions.push('FALSE');
    if (!catalog) {
      add(agentTable ? 'a.ta' : 's.ta', agentTable && user?.role !== ROLES.AGENT ? [] : agents);
      if (agentTable) add('a.department', departments);
      else if (departments.length || values(query.route).length) {
        const inner = ['BTRIM(a.ta) = BTRIM(s.ta)'];
        addInner('a.department', departments);
        addInner('a.route', values(query.route));
        conditions.push('EXISTS (SELECT 1 FROM public.agents a WHERE ' + inner.join(' AND ') + ')');
        function addInner(expression, list) {
          if (list.length) { params.push(list); inner.push(expression + ' = ANY($' + params.length + '::text[])'); }
        }
      }
    }
    if (agentTable) return;
    const prefix = catalog ? '' : 's.';
    add(prefix + 'tm', tms);
    for (const [key, column] of [['group', 'group_name'], ['subgroup', 'subgroup'],
      ['packing', 'packaging'], ['manufacturer', 'manufacturer'], ['product', 'product_name']]) {
      add(prefix + column, values(query[key]));
    }
    if (!catalog) {
      if (query.storeCode != null) { params.push(String(query.storeCode)); conditions.push('s.store_code = $' + params.length); }
      add('s.store_name', values(query.store));
      const search = String(query.storeSearch || '').trim();
      if (search) {
        params.push('%' + search + '%');
        conditions.push('(s.store_name ILIKE $' + params.length + ' OR s.store_code ILIKE $' + params.length + ')');
      }
    }
  };

  const meta = { period, periodType, currentDate, dateFrom, dateTo, groupingFields, columns };
  if (query.view === 'stores') {
    const params = [dateTo, dateFrom];
    const conditions = ['s.sale_date <= $1::date'];
    scopedFilters(params, conditions);
    const filterParams = [], filterConditions = [];
    scopedFilters(filterParams, filterConditions, { agentTable: true });
    return {
      ...meta, view: 'stores',
      stores: {
        // sale_date here already contains the intentional invoice-date-minus-one-day rule.
        sql: `SELECT s.store_code, COALESCE(MAX(NULLIF(s.store_name, '')), 'Без ТТ') AS store_name,
          BOOL_OR(s.sale_date >= $2::date) AS has_recent_sales
          FROM public.sales_history_daily s WHERE ${conditions.join(' AND ')}
          GROUP BY s.store_code ORDER BY store_name, s.store_code`, params,
      },
      filters: {
        sql: `SELECT DISTINCT a.department, a.ta AS agent, a.route FROM public.agents a
          ${filterConditions.length ? 'WHERE ' + filterConditions.join(' AND ') : ''}
          ORDER BY a.department, a.ta`, params: filterParams,
      },
    };
  }

  const params = [dateFrom, dateTo];
  const conditions = ['s.sale_date BETWEEN $1::date AND $2::date'];
  scopedFilters(params, conditions);
  const groupSelect = groupingFields.map((field) => {
    const [column, fallback] = fields[field];
    return 'MAX(COALESCE(NULLIF(s.' + column + ", ''), '" + fallback + "')) AS " + '"' + field + '"';
  }).join(', ');
  const catalogConditions = [], catalogParams = [];
  scopedFilters(catalogParams, catalogConditions, { catalog: true });
  const catalogSelect = groupingFields.map((field) => {
    const [column, fallback] = fields[field];
    return 'COALESCE(NULLIF(BTRIM(' + column + "::text), ''), '" + fallback + "') AS " + '"' + field + '"';
  }).join(', ');
  return {
    ...meta, view: 'details',
    details: {
      sql: `SELECT s.store_code, COALESCE(MAX(NULLIF(s.store_name, '')), 'Без ТТ') AS store_name,
        s.product_code, COALESCE(MAX(NULLIF(s.product_name, '')), 'Без товару') AS product,
        to_char(date_trunc('${periodType}', s.sale_date::timestamp), 'YYYY-MM-DD') AS start_date,
        EXTRACT(${periodType === 'week' ? 'ISOYEAR' : 'YEAR'} FROM s.sale_date)::int AS year,
        EXTRACT(${periodType === 'week' ? 'WEEK' : 'MONTH'} FROM s.sale_date)::int AS period_number,
        SUM(s.quantity) AS quantity, SUM(s.amount) AS amount, SUM(s.weight) AS weight, ${groupSelect}
        FROM public.sales_history_daily s WHERE ${conditions.join(' AND ')}
        GROUP BY s.store_code, s.product_code,
          date_trunc('${periodType}', s.sale_date::timestamp),
          EXTRACT(${periodType === 'week' ? 'ISOYEAR' : 'YEAR'} FROM s.sale_date),
          EXTRACT(${periodType === 'week' ? 'WEEK' : 'MONTH'} FROM s.sale_date)
        ORDER BY product, start_date DESC`, params,
    },
    catalog: {
      sql: 'SELECT DISTINCT ' + catalogSelect + ' FROM public.products ' +
        (catalogConditions.length ? 'WHERE ' + catalogConditions.join(' AND ') : ''),
      params: catalogParams,
    },
  };
};

export const getFastRouteHistory = async ({ pool, query, user }) => {
  const plan = createRouteHistoryPlan({ query, user });
  const run = ({ sql, params }) => pool.query(sql, params);
  if (plan.view === 'stores') {
    const [stores, filters] = await Promise.all([run(plan.stores), run(plan.filters)]);
    return {
      success: true, periods: plan.columns,
      summary: { allStores: stores.rows.length,
        withoutHistory: stores.rows.filter((row) => !row.has_recent_sales).length },
      filters: {
        departments: [...new Set(filters.rows.map((row) => row.department).filter(Boolean))],
        agents: [...new Set(filters.rows.map((row) => row.agent).filter(Boolean))],
        route: [...new Set(filters.rows.map((row) => row.route).filter(Boolean))].join(', '),
      },
      stores: stores.rows.map((row) => ({
        code: row.store_code, name: row.store_name, hasHistory: row.has_recent_sales, items: [],
      })),
    };
  }
  const [details, catalog] = await Promise.all([run(plan.details), run(plan.catalog)]);
  const items = details.rows.map((row) => ({
    product: row.product, productCode: row.product_code, startDate: row.start_date,
    year: row.year, periodNumber: row.period_number,
    quantity: Number(row.quantity || 0), amount: Number(row.amount || 0), weight: Number(row.weight || 0),
    ...Object.fromEntries(plan.groupingFields.map((field) => [field, row[field]])),
  }));
  const existing = new Set(items.map((item) => JSON.stringify(plan.groupingFields.map((field) => item[field]))));
  for (const row of catalog.rows) {
    const key = JSON.stringify(plan.groupingFields.map((field) => row[field]));
    if (existing.has(key)) continue;
    existing.add(key);
    items.push({
      product: '', productCode: null, startDate: plan.columns[0].key,
      year: null, periodNumber: null, quantity: 0, amount: 0, weight: 0,
      ...Object.fromEntries(plan.groupingFields.map((field) => [field, row[field]])),
    });
  }
  const hasHistory = details.rows.length > 0;
  return {
    success: true, periods: plan.columns,
    summary: { allStores: 1, withoutHistory: hasHistory ? 0 : 1 },
    filters: { departments: [], agents: [], route: '' },
    stores: [{
      code: query.storeCode, name: details.rows[0]?.store_name || 'Без ТТ',
      hasHistory, items,
    }],
  };
};

