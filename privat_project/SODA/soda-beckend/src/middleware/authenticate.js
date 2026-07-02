import jwt from 'jsonwebtoken';
import { getUserProfile } from '../config/users.js';

export const authenticate = (req, res, next) => {
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

    const profile = getUserProfile(payload.email);

    if (!profile) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    req.user = {
      id: payload.id,
      email: payload.email,
      role: profile.role,
      department: profile.department,
      departments: profile.departments || [],
      representative: profile.representative,
      brands: profile.brands || [],
    };

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
    });
  }
};
