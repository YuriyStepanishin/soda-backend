import { Router } from 'express';
import multer from 'multer';
import { uploadPrices } from '../controllers/uploadPricesController.js';

const router = Router();

const upload = multer({
  dest: 'uploads/',
});

router.post('/upload', upload.single('file'), uploadPrices);

export default router;
