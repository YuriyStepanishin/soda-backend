import { Router } from 'express';
import { runLaskaImport } from '../controllers/laskaImportController.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

router.post('/run', authenticate, authorize(ROLES.ADMIN), runLaskaImport);

export default router;
