import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { resolveSalesTenant } from '../middleware/tenant.js';
import { isValidId } from '../middleware/isValidId.js';
import { dispatchSalesOperation } from '../modules/sales/sales.controller.js';

const router = Router();
const withSalesTenant = [authenticate, resolveSalesTenant()];

router.get('/summary', ...withSalesTenant, dispatchSalesOperation('summary'));
router.get('/by-days', ...withSalesTenant, dispatchSalesOperation('byDays'));
router.get('/history', ...withSalesTenant, dispatchSalesOperation('history'));
router.get(
  '/route-history',
  ...withSalesTenant,
  dispatchSalesOperation('routeHistory'),
);

router.get(
  '/drilldown',
  ...withSalesTenant,
  dispatchSalesOperation('drilldown'),
);
router.get('/report', ...withSalesTenant, dispatchSalesOperation('report'));
router.get('/stores', ...withSalesTenant, dispatchSalesOperation('stores'));
router.get('/products', ...withSalesTenant, dispatchSalesOperation('products'));
router.get('/dates', ...withSalesTenant, dispatchSalesOperation('dates'));
router.get(
  '/hierarchy',
  ...withSalesTenant,
  dispatchSalesOperation('hierarchy'),
);
router.get('/filters', ...withSalesTenant, dispatchSalesOperation('filters'));
router.get('/', ...withSalesTenant, dispatchSalesOperation('list'));
router.get(
  '/:salesId',
  ...withSalesTenant,
  isValidId,
  dispatchSalesOperation('getById'),
);

export default router;
