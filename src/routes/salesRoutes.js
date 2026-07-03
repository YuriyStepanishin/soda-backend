import { Router } from 'express';

import { getSales, getSaleById } from '../controllers/salesController.js';

import { authenticate } from '../middleware/authenticate.js';
import { isValidId } from '../middleware/isValidId.js';

const router = Router();

router.get('/', authenticate, getSales);

router.get('/:salesId', authenticate, isValidId, getSaleById);

export default router;
