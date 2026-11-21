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

const equipmentScope = `e.tenant_id = 'LASKA'
  AND nullif(btrim(e.store_code), '') IS NOT NULL
  AND (
    $1 IN ('admin', 'manager')
    OR ($1 = 'agent' AND lower(btrim(e.agent_name)) = lower(btrim($2)))
    OR ($1 = 'supervisor' AND EXISTS (
      SELECT 1 FROM public.agents a
       WHERE lower(btrim(a.ta)) = lower(btrim(e.agent_name))
         AND a.department = ANY($3::text[])
    ))
  )`;

const equipmentSearch = `$4 = '' OR strpos(lower(concat_ws(' ', e.store_name, e.store_code,
  e.equipment_name, e.serial_number, e.route_code, e.agent_name)), lower($4)) > 0`;

const storeFilters = filters.extend({
  route: z.string().trim().max(80).default(''),
  presence: z.enum(['all', 'present', 'absent', 'unknown']).default('all'),
  pageSize: z.enum(['20', '50']).default('50').transform(Number),
});

router.use(validateSalesTenantHeader, authenticate, resolveSalesTenant(), (req, res, next) => {
  if (req.salesTenant !== 'laska' || !['admin', 'manager', 'supervisor', 'agent'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Довідник обладнання доступний користувачам ЛАСКА' });
  }
  next();
});

router.get('/', async (req, res) => {
  const { role, representative, departments } = req.user;
  const parsed = filters.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ message: 'Некоректні параметри пошуку' });

  const { search, page } = parsed.data;
  const { rows } = await getPool('laska').query(
    `SELECT e.route_code, e.agent_name, e.store_code, e.store_name,
            e.equipment_name, e.serial_number, e.ownership_label,
            e.volume_liters, e.is_present, e.contract_date::text, e.contract_number,
            e.recorded_value, e.source_file_id, e.source_sheet, e.source_row
       FROM public.outlet_equipment e
      WHERE ${equipmentScope} AND (${equipmentSearch})
      ORDER BY e.route_code, e.store_name, e.store_code, e.source_file_id, e.source_sheet, e.source_row
      LIMIT $5 OFFSET $6`,
    [role, representative || null, departments || [], search, pageSize + 1, (page - 1) * pageSize],
  );

  res.set('Cache-Control', 'no-store').json({
    rows: rows.slice(0, pageSize),
    hasNext: rows.length > pageSize,
  });
});

router.get('/stores', async (req, res) => {
  const parsed = storeFilters.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ message: 'Некоректні параметри пошуку' });

  const { role, representative, departments } = req.user;
  const { search, page, route, presence, pageSize: storePageSize } = parsed.data;
  const { rows: [result] } = await getPool('laska').query(
    `WITH scoped AS (
       SELECT e.route_code, e.agent_name, e.store_code, e.store_name, e.equipment_name,
              e.serial_number, e.ownership_label, e.volume_liters::text, e.is_present,
              e.contract_date::text, e.contract_number, e.recorded_value::text,
              e.source_file_id, e.source_sheet, e.source_row
         FROM public.outlet_equipment e
        WHERE ${equipmentScope}
     ), filtered AS (
       SELECT * FROM scoped
        WHERE ($7 = '' OR route_code = $7)
          AND CASE $8
                WHEN 'present' THEN is_present IS TRUE
                WHEN 'absent' THEN is_present IS FALSE
                WHEN 'unknown' THEN is_present IS NULL
                ELSE TRUE
              END
     ), matching_stores AS (
       SELECT e.store_code
         FROM filtered e
        WHERE ${equipmentSearch}
        GROUP BY e.store_code
     ), store_page AS (
       SELECT e.store_code,
              (array_agg(e.store_name ORDER BY length(e.store_name) DESC NULLS LAST, e.store_name))[1] AS store_name,
              array_agg(DISTINCT e.route_code ORDER BY e.route_code)
                FILTER (WHERE e.route_code IS NOT NULL) AS routes,
              jsonb_agg(to_jsonb(e) - 'store_code' - 'store_name'
                ORDER BY e.equipment_name, e.source_file_id, e.source_sheet, e.source_row) AS equipment
         FROM filtered e
         JOIN matching_stores USING (store_code)
        GROUP BY e.store_code
        ORDER BY store_name, e.store_code
        LIMIT $5 OFFSET $6
     )
     SELECT COALESCE((SELECT jsonb_agg(p ORDER BY p.store_name, p.store_code) FROM store_page p), '[]') AS stores,
            ARRAY(SELECT DISTINCT route_code FROM scoped WHERE nullif(btrim(route_code), '') IS NOT NULL ORDER BY route_code) AS routes`,
    [role, representative || null, departments || [], search, storePageSize + 1, (page - 1) * storePageSize, route, presence],
  );

  res.set('Cache-Control', 'no-store').json({
    stores: result.stores.slice(0, storePageSize),
    routes: result.routes,
    hasNext: result.stores.length > storePageSize,
  });
});

export default router;
