import { getPool } from '../../../db/index.js';
import { getFastRouteHistory } from '../../../models/laskaRouteHistoryModel.js';
import { ROLES } from '../../../constants/roles.js';
import { getPagination } from '../../../utils/getPagination.js';
import {
  getEffectiveQuery,
  validateGroupingFields,
  getSales,
  getSummary,
  getStores,
  getProducts,
  getHierarchy,
  getSalesByDays,
  getSalesDrilldown,
  getSalesReportRows,
  buildSalesHistory,
  getRouteHistoryFilters,
  getFilters,
} from '../../../models/laskaSalesModel.js';

const validateRequest = (req, res) => {
  const message = validateGroupingFields(req.query.groupingFields);
  if (!message) return true;
  res.status(400).json({ success: false, message });
  return false;
};

const formatDateForApi = (value) => {
  if (!value) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('uk-UA', {
    timeZone: process.env.DB_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
};

const getLaskaSales = async (req, res) => {
  try {
    if (!validateRequest(req, res)) return;
    const query = getEffectiveQuery(req);
    const { page, limit, offset } = getPagination(req.query);
    const result = await getSales({ query, page, limit, offset });
    const data = result.rows.map((row) => ({
      ...row,
      Дата: formatDateForApi(row['Дата']),
    }));
    return res.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total: result.total,
        pages: Math.ceil(result.total / limit),
      },
    });
  } catch (error) {
    console.error('[LASKA SALES ERROR]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getLaskaSalesSummary = async (req, res) => {
  try {
    if (!validateRequest(req, res)) return;
    const query = getEffectiveQuery(req);
    const { rows, totals } = await getSummary(query);
    return res.json({ success: true, data: rows, totals });
  } catch (error) {
    console.error('[LASKA SUMMARY ERROR]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getLaskaStores = async (req, res) => {
  try {
    if (!validateRequest(req, res)) return;
    return res.json({
      success: true,
      data: await getStores(getEffectiveQuery(req)),
    });
  } catch (error) {
    console.error('[LASKA STORES ERROR]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getLaskaProducts = async (req, res) => {
  try {
    if (!validateRequest(req, res)) return;
    return res.json({
      success: true,
      data: await getProducts(getEffectiveQuery(req)),
    });
  } catch (error) {
    console.error('[LASKA PRODUCTS ERROR]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getLaskaHierarchy = async (req, res) => {
  try {
    if (!validateRequest(req, res)) return;
    return res.json({
      success: true,
      data: await getHierarchy(getEffectiveQuery(req)),
    });
  } catch (error) {
    console.error('[LASKA HIERARCHY ERROR]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getLaskaSalesByDays = async (req, res) => {
  try {
    if (!validateRequest(req, res)) return;
    return res.json({
      success: true,
      data: await getSalesByDays(getEffectiveQuery(req)),
    });
  } catch (error) {
    console.error('[LASKA SALES BY DAYS ERROR]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

const GROUP_BY_VALUES = new Set([
  'store',
  'date',
  'brand',
  'product',
  'group',
  'subgroup',
  'department',
  'agent',
]);

const REPORT_LABEL_FIELDS = {
  store: ['store', 'storeName'],
  date: ['date'],
  brand: ['brand', 'tm'],
  product: ['product', 'productName'],
  group: ['group'],
  subgroup: ['subgroup'],
  department: ['department'],
  agent: ['agent'],
};

const REPORT_TOTAL_LABELS = {
  store: 'Усі ТТ',
  date: 'Усі дати',
  brand: 'Усі торгові марки',
  product: 'Усі товари',
  group: 'Усі групи',
  subgroup: 'Усі підгрупи',
  department: 'Усі відділи',
  agent: 'Усі ТП',
};

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const pickLabel = (row, reportBy) => {
  const fields = REPORT_LABEL_FIELDS[reportBy] || [];
  for (const field of fields) {
    if (row[field]) return String(row[field]);
  }
  return 'Без назви';
};

const buildReportResponse = ({ rows, reportBy }) => {
  const normalizedRows = rows.map((row) => {
    const label = row.label || pickLabel(row, reportBy);
    return {
      id: label,
      label,
      path: row.path || label,
      level: toNumber(row.level),
      dimensions: row.dimensions || {},
      quantity: toNumber(row.quantity),
      stores: toNumber(row.stores),
      weight: toNumber(row.weight),
      amount: toNumber(row.amount),
      sku: toNumber(row.sku),
    };
  });

  const totals = normalizedRows.reduce(
    (acc, row) => ({
      ...acc,
      quantity: acc.quantity + row.quantity,
      stores: acc.stores + row.stores,
      weight: acc.weight + row.weight,
      amount: acc.amount + row.amount,
      sku: acc.sku + row.sku,
    }),
    {
      id: 'total',
      label: REPORT_TOTAL_LABELS[reportBy] || 'Разом',
      quantity: 0,
      stores: 0,
      weight: 0,
      amount: 0,
      sku: 0,
    },
  );

  return {
    success: true,
    reportBy,
    rows: normalizedRows,
    totals,
  };
};

const getLaskaSalesDrilldown = async (req, res) => {
  try {
    const groupBy =
      typeof req.query.groupBy === 'string' ? req.query.groupBy.trim() : '';

    if (!GROUP_BY_VALUES.has(groupBy)) {
      return res.status(400).json({
        success: false,
        message:
          'groupBy must be one of: store, date, brand, product, department, agent',
      });
    }

    const query = getEffectiveQuery(req);
    const data = await getSalesDrilldown(groupBy, query);

    return res.json({
      success: true,
      groupBy,
      data,
    });
  } catch (error) {
    console.error('[LASKA DRILLDOWN ERROR]', error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getLaskaSalesReport = async (req, res) => {
  try {
    const reportBy = String(req.query.reportBy || 'brand')
      .split(',')
      .map((field) => field.trim())
      .filter(Boolean);

    if (!reportBy.length || reportBy.some((field) => !GROUP_BY_VALUES.has(field))) {
      return res.status(400).json({
        success: false,
        message:
          'reportBy must contain only: group, subgroup, brand, product, store, date, department, agent',
      });
    }

    const query = getEffectiveQuery(req);
    const rows = await getSalesReportRows(reportBy, query);

    return res.json(buildReportResponse({ rows, reportBy: reportBy.join(',') }));
  } catch (error) {
    console.error('[LASKA REPORT ERROR]', error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getLaskaSalesHistory = async (req, res) => {
  if (!validateRequest(req, res)) return;
  try {
    if (!['4weeks', '4months'].includes(req.query.period || '4weeks')) {
      return res
        .status(400)
        .json({ success: false, message: 'period must be 4weeks or 4months' });
    }
    return res.json(
      await buildSalesHistory({ query: req.query, user: req.user }),
    );
  } catch (error) {
    console.error('[LASKA SALES HISTORY ERROR]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getLaskaRouteHistory = async (req, res) => {
  try {
    if (!validateRequest(req, res)) return;

    const period = req.query.period || '4weeks';

    if (!['4weeks', '4months'].includes(period)) {
      return res.status(400).json({
        success: false,
        message: 'period must be 4weeks or 4months',
      });
    }

    if (['stores', 'details'].includes(req.query.view)) {
      if (req.query.view === 'details' && (typeof req.query.storeCode !== 'string' || !req.query.storeCode.trim())) {
        return res.status(400).json({ success: false, message: 'storeCode is required for details' });
      }
      const started = performance.now();
      const result = await getFastRouteHistory({
        pool: getPool('laska'), query: { ...getEffectiveQuery(req), period }, user: req.user,
      });
      console.log('[ROUTE HISTORY FAST] ' + req.query.view + ' ' + period + ': ' + Math.round(performance.now() - started) + 'ms');
      return res.json(result);
    }
    const groupingFields = String(req.query.groupingFields || 'tm')
      .split(',')
      .map((field) => field.trim().toLowerCase())
      .filter(Boolean);

    const query = {
      ...getEffectiveQuery(req),
      period,
      groupingFields: groupingFields.join(','),
      includeEmptyGroups: true,
    };

    console.time('[ROUTE HISTORY] build history');
    const historyResponse = await buildSalesHistory({
      query,
      user: req.user,
    });
    console.timeEnd('[ROUTE HISTORY] build history');

    const effectiveQuery = getEffectiveQuery({
      query,
      user: req.user,
    });

    console.time('[ROUTE HISTORY] filters');
    const filterRows = await getRouteHistoryFilters({
      ta: effectiveQuery.ta,
      department: effectiveQuery.department,
    });
    console.timeEnd('[ROUTE HISTORY] filters');

    const routes = [
      ...new Set(filterRows.map((row) => row.route).filter(Boolean)),
    ];

    console.time('[ROUTE HISTORY] response shape');
    const response = {
      success: true,
      periods: historyResponse.columns,
      summary: {
        allStores: historyResponse.summary.storesCount,
        withoutHistory: historyResponse.summary.storesWithoutSalesLast4Weeks,
      },
      filters: {
        departments: [
          ...new Set(filterRows.map((row) => row.department).filter(Boolean)),
        ],
        agents: [
          ...new Set(filterRows.map((row) => row.agent).filter(Boolean)),
        ],
        route: routes.join(', '),
      },
      stores: historyResponse.data.map((store) => ({
        ...store,
        hasHistory: store.hasRecentSales,
      })),
    };
    console.timeEnd('[ROUTE HISTORY] response shape');

    return res.json(response);
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ success: false, message: error.message });
    console.error('[LASKA ROUTE HISTORY ERROR]', error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getLaskaFilters = async (req, res) => {
  try {
    if (!validateRequest(req, res)) return;
    return res.json({
      success: true,
      ...(await getFilters(getEffectiveQuery(req))),
    });
  } catch (error) {
    console.error('[LASKA FILTERS ERROR]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const laskaSalesAdapter = {
  allowedRoles: [
    ROLES.ADMIN,
    ROLES.MANAGER,
    ROLES.SUPERVISOR,
    ROLES.AGENT,
    ROLES.BRAND_MANAGER,
  ],
  list: getLaskaSales,
  summary: getLaskaSalesSummary,
  stores: getLaskaStores,
  products: getLaskaProducts,
  hierarchy: getLaskaHierarchy,
  filters: getLaskaFilters,
  byDays: getLaskaSalesByDays,
  drilldown: getLaskaSalesDrilldown,
  report: getLaskaSalesReport,
  history: getLaskaSalesHistory,
  routeHistory: getLaskaRouteHistory,
};
