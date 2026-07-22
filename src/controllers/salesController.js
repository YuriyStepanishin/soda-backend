import {
  getAllSales,
  getSale,
  getSummary,
  getStores,
  getProducts,
  getDates,
  getHierarchy,
  getFilters,
} from '../services/salesService.js';

export const getSales = async (req, res) => {
  try {
    const page = req.query.page;
    const limit = req.query.limit;

    const filters = {
      search: req.query.search,
      brands: req.query.brands,
      stores: req.query.stores ?? req.query.store,
      agent: req.query.agent,
      department: req.query.department,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
    };

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

export const getSalesSummary = async (req, res) => {
  try {
    const filters = {
      search: req.query.search,
      stores: req.query.stores ?? req.query.store,
      brands: req.query.brands,
      agent: req.query.agent,
      department: req.query.department,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
    };

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
export const getStoresSummary = async (req, res) => {
  try {
    const filters = {
      search: req.query.search,

      brands: req.query.brands,

      stores: req.query.stores,
      storeSearch: req.query.storeSearch,

      products: req.query.products,

      agent: req.query.agent,
      department: req.query.department,

      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
    };

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
export const getStoreProducts = async (req, res) => {
  try {
    const filters = {
      search: req.query.search,
      brands: req.query.brands,
      stores: req.query.stores ?? req.query.store,
      agent: req.query.agent,
      department: req.query.department,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
    };

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
export const getStoreDates = async (req, res) => {
  try {
    const filters = {
      search: req.query.search,
      brands: req.query.brands,
      stores: req.query.stores ?? req.query.store,
      agent: req.query.agent,
      department: req.query.department,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
    };

    const data = await getDates(req.user, filters);

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('getSalesFilters error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getSalesHierarchyController = async (req, res) => {
  try {
    const filters = {
      search: req.query.search,
      brands: req.query.brands,
      stores: req.query.stores ?? req.query.store,
      agent: req.query.agent,
      department: req.query.department,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
    };

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

export const getSalesFilters = async (req, res) => {
  try {
    const data = await getFilters(req.user, req.query);

    res.json(data);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
