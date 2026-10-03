import { Router } from 'express';

import {
  runAgentsImport,
  runProductsImport,
} from '../controllers/laskaDictionaryController.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

router.post('/agents', authenticate, authorize(ROLES.ADMIN), runAgentsImport);
router.post('/products', authenticate, authorize(ROLES.ADMIN), runProductsImport);

export default router;
