import { Router } from 'express';

import {
  runAgentsImport,
  runProductsImport,
} from '../controllers/laskaDictionaryController.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { ROLES } from '../constants/roles.js';
import { validateSalesTenantHeader, resolveSalesTenant } from '../middleware/tenant.js';
import compression from 'compression';
import { getPool } from '../db/index.js';

const router = Router();
const purchasePriceRoles = [ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.MANAGER];

router.post('/agents', authenticate, authorize(ROLES.ADMIN), runAgentsImport);
router.post('/products', authenticate, authorize(ROLES.ADMIN), runProductsImport);

router.get('/price', validateSalesTenantHeader, authenticate, resolveSalesTenant(), authorize(...purchasePriceRoles, ROLES.AGENT),
  compression({ threshold: 1024, level: 4 }), async (req, res) => {
    if (req.salesTenant !== 'laska') {
      return res.status(403).json({ message: 'Прайс доступний лише для ЛАСКА.' });
    }
    res.set('Cache-Control', 'private, no-store');
    const canViewPurchase = purchasePriceRoles.includes(req.user.role);
    const purchaseColumn = canViewPurchase ? ", 'purchase', item.purchase_price" : '';
    const { rows: [snapshot] } = await getPool('laska').query(
      `SELECT to_char(version.price_date, 'DD.MM.YYYY') AS date,
              json_agg(json_build_object(
                'row', item.source_row, 'name', item.name, 'unit', item.unit,
                'route', item.section_path, 'base', item.base_price${purchaseColumn}
              ) ORDER BY item.source_row) AS rows
         FROM (
           SELECT price_date FROM public.laska_price_versions
            WHERE published_at IS NOT NULL ORDER BY price_date DESC LIMIT 1
         ) version
         JOIN public.laska_price_items item USING (price_date)
        GROUP BY version.price_date`,
    );
    if (!snapshot) return res.status(404).json({ message: 'Прайс ЛАСКА ще не завантажено.' });
    return res.json({ ...snapshot, canViewPurchase });
  });

export default router;
