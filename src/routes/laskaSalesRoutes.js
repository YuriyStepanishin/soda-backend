import { Router } from 'express';
import { getLaskaSales } from '../controllers/laskaSalesController.js';
import {
  getLaskaFilters,
  getLaskaHierarchy,
  getLaskaProducts,
  getLaskaSalesSummary,
  getLaskaStores,
} from '../controllers/laskaSalesAnalyticsController.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

router.get('/', authenticate, authorize(ROLES.ADMIN), getLaskaSales);
router.get('/summary', authenticate, authorize(ROLES.ADMIN), getLaskaSalesSummary);
router.get('/stores', authenticate, authorize(ROLES.ADMIN), getLaskaStores);
router.get('/products', authenticate, authorize(ROLES.ADMIN), getLaskaProducts);
router.get('/hierarchy', authenticate, authorize(ROLES.ADMIN), getLaskaHierarchy);
router.get('/filters', authenticate, authorize(ROLES.ADMIN), getLaskaFilters);

export default router;
