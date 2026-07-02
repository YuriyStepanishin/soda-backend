import { getAllSales, getSale } from '../services/salesService.js';

export const getSales = async (req, res) => {
  try {
    const page = req.query.page;
    const limit = req.query.limit;

    const filters = {
      search: req.query.search,
      brand: req.query.brand,
      agent: req.query.agent,
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
