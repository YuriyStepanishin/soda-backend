import { buildSalesWhere } from '../../../config/users_db/olgatorgUsers.js';
import { buildRequestWhere } from '../../../utils/buildRequestWhere.js';
import { getPagination } from '../../../utils/getPagination.js';
import {
  findAllSales,
  findSaleById,
  countSales,
  getSalesSummary as querySalesSummary,
  getSalesTotals,
  getSalesDrilldown as querySalesDrilldown,
  getSalesReportRows as querySalesReportRows,
  getStoresSummary as queryStoresSummary,
  getStoreProducts as queryStoreProducts,
  getStoreDates as queryStoreDates,
  getSalesHierarchy,
  getFiltersData,
} from '../../../models/olgatorgSalesModel.js';
import {
  buildOlgatorgRouteHistory,
  getOlgatorgRouteHistoryFilters,
} from '../../../models/olgatorgSalesHistoryModel.js';

const buildUserFilter = (user, filters) =>
  buildRequestWhere(filters, buildSalesWhere(user));

const getAllSales = async (user, filters, pagination) => {
  const filter = buildUserFilter(user, filters);
  const normalizedPagination = getPagination(pagination);
  const [sales, total] = await Promise.all([
    findAllSales(filter, normalizedPagination),
    countSales(filter),
  ]);

  return {
    sales,
    total,
    page: normalizedPagination.page,
    limit: normalizedPagination.limit,
  };
};

const getSummary = async (user, filters) => {
  const filter = buildUserFilter(user, filters);
  const [summary, totals] = await Promise.all([
    querySalesSummary(filter),
    getSalesTotals(filter),
  ]);

  return { summary, totals };
};

const getDrilldown = (user, groupBy, filters) =>
  querySalesDrilldown(groupBy, buildUserFilter(user, filters));
const getReportRows = (user, groupBy, filters) =>
  querySalesReportRows(groupBy, buildUserFilter(user, filters));

const getSale = (user, id) => findSaleById(id, buildUserFilter(user, {}));
const getStores = (user, filters) =>
  queryStoresSummary(buildUserFilter(user, filters));
const getProducts = (user, filters) =>
  queryStoreProducts(buildUserFilter(user, filters));
const getDates = (user, filters) =>
  queryStoreDates(buildUserFilter(user, filters));
const getHierarchy = (user, filters) =>
  getSalesHierarchy(buildUserFilter(user, filters));
const getFilters = (user, filters = {}) =>
  getFiltersData(filters, buildSalesWhere(user));

const GROUP_BY_VALUES = new Set([
  'store',
  'date',
  'brand',
  'product',
  'department',
  'agent',
]);
const GROUPING_FIELDS = new Set(['group', 'subgroup', 'tm', 'packing']);

const REPORT_LABEL_FIELDS = {
  store: ['storeName', 'store'],
  date: ['date'],
  brand: ['tm', 'brand'],
  product: ['productName', 'product'],
  department: ['department'],
  agent: ['agent'],
};

const REPORT_TOTAL_LABELS = {
  store: 'Усі ТТ',
  date: 'Усі дати',
  brand: 'Усі торгові марки',
  product: 'Усі товари',
  department: 'Усі відділи',
  agent: 'Усі ТП',
};

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const pickReportLabel = (row, reportBy) => {
  const fields = REPORT_LABEL_FIELDS[reportBy] || [];
  for (const field of fields) {
    if (row[field]) return String(row[field]);
  }
  return 'Без назви';
};

const buildReportResponse = ({ rows, reportBy }) => {
  const normalizedRows = rows.map((row) => {
    const label = row.label || pickReportLabel(row, reportBy);
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

const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const validateGroupingFields = (value) => {
  if (typeof value !== 'string') return null;

  const fields = value
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return fields.some((field) => !GROUPING_FIELDS.has(field))
    ? 'groupingFields must contain only: group, subgroup, tm, packing'
    : null;
};

const readSalesFilters = (query) => ({
  search: query.search,
  brands: query.brands,
  stores: query.stores ?? query.store,
  products: query.products,
  storeSearch: query.storeSearch,
  agent: query.agent,
  department: query.department,
  dateFrom: query.dateFrom,
  dateTo: query.dateTo,
});

const validateDateRange = ({ dateFrom, dateTo }) => {
  if (dateFrom && !isIsoDate(dateFrom)) {
    return 'dateFrom must be YYYY-MM-DD';
  }

  if (dateTo && !isIsoDate(dateTo)) {
    return 'dateTo must be YYYY-MM-DD';
  }

  if (dateFrom && dateTo && dateFrom > dateTo) {
    return 'dateFrom must be less than or equal to dateTo';
  }

  return null;
};

const validateQuery = (req, res, filters = readSalesFilters(req.query)) => {
  const groupingError = validateGroupingFields(req.query.groupingFields);
  if (groupingError) {
    res.status(400).json({ success: false, message: groupingError });
    return null;
  }

  const dateError = validateDateRange(filters);
  if (dateError) {
    res.status(400).json({ success: false, message: dateError });
    return null;
  }

  return filters;
};

const withErrorResponse = (handler, logMessage) => async (req, res) => {
  try {
    return await handler(req, res);
  } catch (error) {
    if (logMessage) console.error(logMessage, error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getSales = withErrorResponse(async (req, res) => {
  const filters = validateQuery(req, res);
  if (!filters) return;

  const result = await getAllSales(req.user, filters, {
    page: req.query.page,
    limit: req.query.limit,
  });

  return res.json({
    success: true,
    data: result.sales,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      pages: Math.ceil(result.total / result.limit),
    },
  });
});

const getSalesSummary = withErrorResponse(async (req, res) => {
  const filters = validateQuery(req, res);
  if (!filters) return;

  const result = await getSummary(req.user, filters);
  return res.json({
    success: true,
    data: result.summary,
    totals: result.totals,
  });
});

const getSalesDrilldown = withErrorResponse(async (req, res) => {
  const groupBy =
    typeof req.query.groupBy === 'string' ? req.query.groupBy.trim() : '';

  if (!GROUP_BY_VALUES.has(groupBy)) {
    return res.status(400).json({
      success: false,
      message:
        'groupBy must be one of: store, date, brand, product, department, agent',
    });
  }

  const filters = validateQuery(req, res);
  if (!filters) return;

  const data = await getDrilldown(req.user, groupBy, filters);
  return res.json({ success: true, groupBy, data });
});

const getSalesReport = withErrorResponse(async (req, res) => {
  const reportBy = String(req.query.reportBy || 'brand')
    .split(',')
    .map((field) => field.trim())
    .filter(Boolean);

  if (
    !reportBy.length ||
    reportBy.some((field) => !GROUP_BY_VALUES.has(field))
  ) {
    return res.status(400).json({
      success: false,
      message:
        'reportBy must contain only: brand, product, store, date, department, agent',
    });
  }

  const filters = validateQuery(req, res);
  if (!filters) return;

  const rows = await getReportRows(req.user, reportBy, filters);
  return res.json(buildReportResponse({ rows, reportBy: reportBy.join(',') }));
}, '[OLGATORG REPORT ERROR]');

const getSaleById = withErrorResponse(async (req, res) => {
  const sale = await getSale(req.user, req.params.salesId);

  if (!sale) {
    return res.status(404).json({
      success: false,
      message: 'Продаж не знайдено',
    });
  }

  return res.json({ success: true, data: sale });
});

const getStoresSummary = withErrorResponse(async (req, res) => {
  const filters = validateQuery(req, res);
  if (!filters) return;

  const stores = await getStores(req.user, filters);
  return res.json({ success: true, data: stores });
});

const getStoreProducts = withErrorResponse(async (req, res) => {
  const filters = validateQuery(req, res);
  if (!filters) return;

  const data = await getProducts(req.user, filters);
  return res.json({ success: true, data });
});

const getStoreDates = withErrorResponse(async (req, res) => {
  const filters = validateQuery(req, res);
  if (!filters) return;

  const data = await getDates(req.user, filters);
  return res.json({ success: true, data });
}, 'getStoreDates error:');

const getSalesHierarchyController = withErrorResponse(async (req, res) => {
  const filters = validateQuery(req, res);
  if (!filters) return;

  const data = await getHierarchy(req.user, filters);
  return res.json({ success: true, data });
});

const getSalesFilters = withErrorResponse(async (req, res) => {
  const filters = validateQuery(req, res, req.query);
  if (!filters) return;

  const data = await getFilters(req.user, req.query);
  return res.json(data);
});

const getRouteHistory = withErrorResponse(async (req, res) => {
  const period = req.query.period || '4weeks';

  if (!['4weeks', '4months'].includes(period)) {
    return res.status(400).json({
      success: false,
      message: 'period must be 4weeks or 4months',
    });
  }

  const groupingFields = String(req.query.groupingFields || 'tm')
    .split(',')
    .map((field) => field.trim().toLowerCase())
    .filter(Boolean);

  if (groupingFields.length && groupingFields.some((field) => field !== 'tm')) {
    return res.status(400).json({
      success: false,
      message: 'OLGATORG route history supports groupingFields=tm',
    });
  }

  console.time('[OLGATORG ROUTE HISTORY] build history');
  const historyResponse = await buildOlgatorgRouteHistory({
    query: {
      ...req.query,
      period,
      groupingFields: 'tm',
    },
    user: req.user,
  });
  console.timeEnd('[OLGATORG ROUTE HISTORY] build history');

  console.time('[OLGATORG ROUTE HISTORY] filters');
  const filterRows = await getOlgatorgRouteHistoryFilters(req.user);
  console.timeEnd('[OLGATORG ROUTE HISTORY] filters');

  return res.json({
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
      agents: [...new Set(filterRows.map((row) => row.agent).filter(Boolean))],
      route: '',
    },
    stores: historyResponse.data.map((store) => ({
      ...store,
      hasHistory: store.hasRecentSales,
    })),
  });
}, '[OLGATORG ROUTE HISTORY ERROR]');

export const olgatorgSalesAdapter = {
  list: getSales,
  getById: getSaleById,
  summary: getSalesSummary,
  drilldown: getSalesDrilldown,
  report: getSalesReport,
  stores: getStoresSummary,
  products: getStoreProducts,
  dates: getStoreDates,
  routeHistory: getRouteHistory,
  hierarchy: getSalesHierarchyController,
  filters: getSalesFilters,
};
