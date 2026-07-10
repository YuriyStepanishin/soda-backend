import { Router } from 'express';
import { getExcelFiles } from '../services/googleDriveService.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

router.get(
  '/',
  authenticate,
  authorize(ROLES.ADMIN, ROLES.MANAGER),
  async (req, res) => {
    const files = await getExcelFiles();

    res.json(files);
  },
);

export default router;
