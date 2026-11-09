import jwt from 'jsonwebtoken';
import { getAuthContextByEmail } from '../services/authService.js';

// Перевіряє Bearer JWT, підтягує user-контекст і кладе його в req.user.
export const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      success: false,
      message: 'Authorization header missing',
    });
  }

  const [bearer, token] = authHeader.split(' ');

  if (bearer !== 'Bearer' || !token) {
    return res.status(401).json({
      success: false,
      message: 'Invalid authorization format',
    });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
    if (typeof payload.email !== 'string') throw new Error('Missing identity');
  } catch {
    return res.status(401).json({ success: false, message: 'Сесія завершилася. Увійдіть у застосунок повторно.' });
  }

  try {

    const userContext = await getAuthContextByEmail(payload.email);

    if (!userContext) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    req.user = userContext;

    next();
  } catch {
    // A database outage must not revoke a valid session or its offline reports.
    return res.status(503).json({
      success: false,
      message: 'Сервіс авторизації тимчасово недоступний. Спробуйте ще раз.',
    });
  }
};
