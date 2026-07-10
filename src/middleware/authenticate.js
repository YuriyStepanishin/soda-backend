import jwt from 'jsonwebtoken';
import { getAuthContextByEmail } from '../services/authService.js';

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

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

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
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
    });
  }
};
