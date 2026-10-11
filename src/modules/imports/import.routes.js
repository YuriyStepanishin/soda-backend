import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { ROLES } from '../../constants/roles.js';

const ROUTE_METHODS = new Set(['get', 'post']);

export const createImportRouter = ({ method, handler }) => {
  const normalizedMethod = method?.toLowerCase();

  if (!ROUTE_METHODS.has(normalizedMethod)) {
    throw new Error(`Unsupported import route method: ${method}`);
  }

  const router = Router();
  router[normalizedMethod](
    '/run',
    authenticate,
    authorize(ROLES.ADMIN),
    handler,
  );

  return router;
};
