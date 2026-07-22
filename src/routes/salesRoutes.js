import { Router } from 'express';

import {
  getSales,
  getSaleById,
  getSalesSummary,
  getStoresSummary,
  getStoreProducts,
  getStoreDates,
  getSalesHierarchyController,
  getSalesFilters,
} from '../controllers/salesController.js';

import { authenticate } from '../middleware/authenticate.js';
import { isValidId } from '../middleware/isValidId.js';

const router = Router();

router.get('/summary', authenticate, getSalesSummary);
router.get('/stores', authenticate, getStoresSummary);
router.get('/products', authenticate, getStoreProducts);
router.get('/dates', authenticate, getStoreDates);
router.get('/hierarchy', authenticate, getSalesHierarchyController);
router.get('/filters', authenticate, getSalesFilters);

router.get('/', authenticate, getSales);

router.get('/:salesId', authenticate, isValidId, getSaleById);

export default router;
