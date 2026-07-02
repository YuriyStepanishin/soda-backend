import { Router } from 'express';
import { getExcelFiles } from '../services/googleDriveService.js';

const router = Router();

router.get('/', async (req, res) => {
  const files = await getExcelFiles();

  res.json(files);
});

export default router;
