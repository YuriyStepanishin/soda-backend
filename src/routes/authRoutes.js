import { Router } from 'express';
import { login, changePassword } from '../controllers/authController.js';
import { validateBody } from '../middleware/validateBody.js';
import { authenticate } from '../middleware/authenticate.js';
import {
  loginSchema,
  changePasswordSchema,
} from '../validators/authSchemas.js';

const router = Router();

// Авторизація: валідація тіла -> контролер логіну.
router.post('/login', validateBody(loginSchema), login);
// Зміна пароля: спочатку JWT-автентифікація, далі валідація тіла, потім контролер.
router.post(
  '/change-password',
  authenticate,
  validateBody(changePasswordSchema),
  changePassword,
);

export default router;
