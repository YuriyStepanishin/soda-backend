import { Router } from 'express';
import { login, changePassword } from '../controllers/authController.js';
import { validateBody } from '../middleware/validateBody.js';
import { authenticate } from '../middleware/authenticate.js';
import {
  loginSchema,
  changePasswordSchema,
} from '../validators/authSchemas.js';

const router = Router();

router.post('/login', validateBody(loginSchema), login);
router.post(
  '/change-password',
  authenticate,
  validateBody(changePasswordSchema),
  changePassword,
);

export default router;
