import { Router } from 'express';
import multer from 'multer';
import { uploadPrices } from '../controllers/uploadPricesController.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

const upload = multer({
  dest: 'uploads/',
});

router.post(
  '/upload',
  authenticate,
  authorize(ROLES.ADMIN, ROLES.MANAGER),
  upload.single('file'),
  uploadPrices,
);

export default router;
