import { Router } from 'express';
import multer from 'multer';

import { uploadSales } from '../controllers/uploadController.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

const upload = multer({
  dest: 'uploads/',
});

router.post(
  '/',
  authenticate,
  authorize(ROLES.ADMIN, ROLES.MANAGER),
  upload.single('file'),
  uploadSales,
);

export default router;
