import { Router } from 'express';
import { z } from 'zod';
import { getPool } from '../db/index.js';
import { authenticate } from '../middleware/authenticate.js';
import { resolveSalesTenant, validateSalesTenantHeader } from '../middleware/tenant.js';

const router = Router();
const pageSize = 50;
const filters = z.object({
  search: z.string().trim().max(160).default(''),
  page: z.coerce.number().int().min(1).max(10000).default(1),
});

router.use(validateSalesTenantHeader, authenticate, resolveSalesTenant());

router.get('/', async (req, res) => {
  const { role, representative, departments } = req.user;
  if (req.salesTenant !== 'laska' || !['admin', 'manager', 'supervisor', 'agent'].includes(role)) {
    return res.status(403).json({ message: 'Довідник обладнання доступний користувачам ЛАСКА' });
  }

  const parsed = filters.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ message: 'Некоректні параметри пошуку' });

  const { search, page } = parsed.data;
  const { rows } = await getPool('laska').query(
    `SELECT e.route_code, e.agent_name, e.store_code, e.store_name,
            e.equipment_name, e.serial_number, e.ownership_label,
            e.volume_liters, e.is_present, e.contract_date::text, e.contract_number,
            e.recorded_value, e.source_file_id, e.source_sheet, e.source_row
       FROM public.outlet_equipment e
      WHERE e.tenant_id = 'LASKA'
        AND nullif(btrim(e.store_code), '') IS NOT NULL
        AND (
          $1 IN ('admin', 'manager')
          OR ($1 = 'agent' AND lower(btrim(e.agent_name)) = lower(btrim($2)))
          OR ($1 = 'supervisor' AND EXISTS (
            SELECT 1 FROM public.agents a
             WHERE lower(btrim(a.ta)) = lower(btrim(e.agent_name))
               AND a.department = ANY($3::text[])
          ))
        )
        AND (
          $4 = '' OR strpos(lower(concat_ws(' ', e.store_name, e.store_code,
            e.equipment_name, e.serial_number, e.route_code, e.agent_name)), lower($4)) > 0
        )
      ORDER BY e.route_code, e.store_name, e.store_code, e.source_file_id, e.source_sheet, e.source_row
      LIMIT $5 OFFSET $6`,
    [role, representative || null, departments || [], search, pageSize + 1, (page - 1) * pageSize],
  );

  res.set('Cache-Control', 'no-store').json({
    rows: rows.slice(0, pageSize),
    hasNext: rows.length > pageSize,
  });
});

export default router;
