import { Router } from 'express';

import { runImport } from '../controllers/importController.js';

import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

router.get('/run', authenticate, authorize(ROLES.ADMIN), runImport);

export default router;
