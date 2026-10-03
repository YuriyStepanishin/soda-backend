import {
  getAllSales,
  getSale,
  getSummary,
  getDrilldown,
  getStores,
  getProducts,
  getDates,
  getHierarchy,
  getFilters,
} from '../services/olgatorgSalesService.js';

const GROUP_BY_VALUES = new Set(['store', 'date', 'brand', 'product']);

const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);

// Нормалізує query-параметри фільтрації в єдиний shape для сервісного шару.
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

// Валідує інтервал дат до виклику сервісу, щоб уникати зайвих запитів у БД.
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

// Список продажів: читає фільтри + пагінацію, делегує сервісу, повертає API-формат.
export const getSales = async (req, res) => {
  try {
    const page = req.query.page;
    const limit = req.query.limit;

    const filters = readSalesFilters(req.query);
    const dateError = validateDateRange(filters);

    if (dateError) {
      return res.status(400).json({
        success: false,
        message: dateError,
      });
    }

    const result = await getAllSales(req.user, filters, {
      page,
      limit,
    });

    res.json({
      success: true,
      data: result.sales,

      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        pages: Math.ceil(result.total / result.limit),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Агрегована зведена статистика (summary + totals) для дашборда.
export const getSalesSummary = async (req, res) => {
  try {
    const filters = readSalesFilters(req.query);
    const dateError = validateDateRange(filters);

    if (dateError) {
      return res.status(400).json({
        success: false,
        message: dateError,
      });
    }

    const result = await getSummary(req.user, filters);

    res.json({
      success: true,
      data: result.summary,
      totals: result.totals,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Drilldown-ендпоінт: перевіряє groupBy і повертає деталізацію по виміру.
export const getSalesDrilldown = async (req, res) => {
  try {
    const groupBy =
      typeof req.query.groupBy === 'string' ? req.query.groupBy.trim() : '';

    if (!GROUP_BY_VALUES.has(groupBy)) {
      return res.status(400).json({
        success: false,
        message: 'groupBy must be one of: store, date, brand, product',
      });
    }

    const filters = readSalesFilters(req.query);
    const dateError = validateDateRange(filters);

    if (dateError) {
      return res.status(400).json({
        success: false,
        message: dateError,
      });
    }

    const data = await getDrilldown(req.user, groupBy, filters);

    res.json({
      success: true,
      groupBy,
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Повертає одну сутність продажу за ідентифікатором.
export const getSaleById = async (req, res) => {
  try {
    const sale = await getSale(req.params.salesId);

    if (!sale) {
      return res.status(404).json({
        success: false,
        message: 'Продаж не знайдено',
      });
    }

    res.json({
      success: true,
      data: sale,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
// Повертає список магазинів з урахуванням прав доступу та фільтрів.
export const getStoresSummary = async (req, res) => {
  try {
    const filters = readSalesFilters(req.query);
    const dateError = validateDateRange(filters);

    if (dateError) {
      return res.status(400).json({
        success: false,
        message: dateError,
      });
    }

    const stores = await getStores(req.user, filters);

    res.json({
      success: true,
      data: stores,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
// Повертає продукти в контексті обраних фільтрів (store/date/brand тощо).
export const getStoreProducts = async (req, res) => {
  try {
    const filters = readSalesFilters(req.query);
    const dateError = validateDateRange(filters);

    if (dateError) {
      return res.status(400).json({
        success: false,
        message: dateError,
      });
    }

    const data = await getProducts(req.user, filters);

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
// Повертає дати, доступні у відфільтрованій вибірці.
export const getStoreDates = async (req, res) => {
  try {
    const filters = readSalesFilters(req.query);
    const dateError = validateDateRange(filters);

    if (dateError) {
      return res.status(400).json({
        success: false,
        message: dateError,
      });
    }

    const data = await getDates(req.user, filters);

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('getStoreDates error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Повертає ієрархію даних для деревоподібного drilldown у frontend.
export const getSalesHierarchyController = async (req, res) => {
  try {
    const filters = readSalesFilters(req.query);
    const dateError = validateDateRange(filters);

    if (dateError) {
      return res.status(400).json({
        success: false,
        message: dateError,
      });
    }

    const data = await getHierarchy(req.user, filters);

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Повертає набір значень для UI-фільтрів (brands/stores/products тощо).
export const getSalesFilters = async (req, res) => {
  try {
    const dateError = validateDateRange(req.query);

    if (dateError) {
      return res.status(400).json({
        success: false,
        message: dateError,
      });
    }

    const data = await getFilters(req.user, req.query);

    res.json(data);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
