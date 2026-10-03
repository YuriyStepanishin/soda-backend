import { Router } from 'express';

import {
  getSales,
  getSaleById,
  getSalesSummary,
  getSalesDrilldown,
  getStoresSummary,
  getStoreProducts,
  getStoreDates,
  getSalesHierarchyController,
  getSalesFilters,
} from '../controllers/olgatorgSalesController.js';

import { authenticate } from '../middleware/authenticate.js';
import { isValidId } from '../middleware/isValidId.js';

const router = Router();

// Агреговані вітрини для дашборда/аналітики.
router.get('/summary', authenticate, getSalesSummary);
router.get('/drilldown', authenticate, getSalesDrilldown);
router.get('/stores', authenticate, getStoresSummary);
router.get('/products', authenticate, getStoreProducts);
router.get('/dates', authenticate, getStoreDates);
router.get('/hierarchy', authenticate, getSalesHierarchyController);
router.get('/filters', authenticate, getSalesFilters);

// Базовий список продажів із пагінацією та фільтрами.
router.get('/', authenticate, getSales);

// Детальна картка продажу за id.
router.get('/:salesId', authenticate, isValidId, getSaleById);

export default router;
