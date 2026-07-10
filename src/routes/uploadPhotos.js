import express from 'express';
import { upload } from '../middleware/upload.js';
import { uploadPhoto } from '../controllers/uploadPhotosCloudinary.js';
import { authenticate } from '../middleware/authenticate.js';

const router = express.Router();

router.post('/', authenticate, upload.single('photo'), uploadPhoto);

export default router;
