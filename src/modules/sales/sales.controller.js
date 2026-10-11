import { getSalesOperation } from './sales.service.js';

export const dispatchSalesOperation = (operation) => async (req, res, next) => {
  const handler = getSalesOperation(req.salesTenant, operation);

  if (!handler) {
    return res.status(501).json({
      success: false,
      message: `Sales operation "${operation}" is not supported for ${req.salesTenant}`,
    });
  }

  try {
    return await handler(req, res, next);
  } catch (error) {
    return next(error);
  }
};
