import { Router } from 'express';
import multer from 'multer';

import { uploadSales } from '../controllers/uploadController.js';

const router = Router();

const upload = multer({
  dest: 'uploads/',
});

router.post('/', upload.single('file'), uploadSales);

export default router;
