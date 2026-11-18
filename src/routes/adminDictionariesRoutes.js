import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { ROLES } from '../constants/roles.js';
import { getPool } from '../db/index.js';

const router = Router();
router.use(authenticate, authorize(ROLES.ADMIN));
router.use((req, res, next) => {
  if (req.headers['x-tenant-id'] !== 'laska') return res.status(403).json({ message: 'Довідники доступні лише для ЛАСКА.' });
  next();
});
const pool = getPool('laska');
const tables = {
  products: { table: 'products', fields: ['product_name', 'manufacturer', 'tm', 'group_name', 'subgroup', 'packaging'], required: ['product_name'] },
  routes: { table: 'sales_routes', fields: ['agent_name', 'route_day', 'stop_order', 'store_code', 'store_name'], required: ['agent_name', 'route_day', 'stop_order', 'store_name'] },
};
const config = (req, res) => {
  const c = tables[req.params.kind];
  if (!c) res.status(404).json({ message: 'Невідомий довідник.' });
  return c;
};
const validate = (c, body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Некоректні дані');
  const result = {};
  for (const key of c.fields) {
    const v = body[key];
    if (v === undefined) continue;
    if (key === 'stop_order') {
      if (!Number.isInteger(Number(v)) || Number(v) < 1) throw new Error('Порядок має бути додатним цілим числом');
      result[key] = Number(v);
    } else {
      if (v !== null && typeof v !== 'string') throw new Error('Некоректне поле: ' + key);
      result[key] = v === null ? null : v.trim().slice(0, 500);
    }
  }
  for (const key of c.required) if (!result[key]) throw new Error('Заповніть поле ' + key);
  if (c.table === 'sales_routes') {
    if (!['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'НД'].includes(result.route_day)) throw new Error('Невірний день тижня');
  }
  return result;
};
const handle = (fn) => async (req, res) => {
  try { await fn(req, res); } catch (e) {
    if (e.message?.startsWith('Заповніть') || e.message?.startsWith('Некорект') || e.message?.startsWith('Невірний') || e.message?.startsWith('Порядок')) return res.status(400).json({ message: e.message });
    console.error('Dictionary editor:', e);
    res.status(500).json({ message: 'Помилка роботи з довідником.' });
  }
};
router.get('/:kind', handle(async (req, res) => {
  const c = config(req, res); if (!c) return;
  const q = String(req.query.q || '').slice(0, 120);
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const filter = q ? ' WHERE ' + (c.table === 'products' ? "product_name ILIKE $1" : "store_name ILIKE $1 OR agent_name ILIKE $1") : '';
  const params = q ? ['%' + q + '%'] : [];
  const count = await pool.query('SELECT count(*)::int AS total FROM ' + c.table + filter, params);
  const result = await pool.query('SELECT * FROM ' + c.table + filter + ' ORDER BY id DESC LIMIT 50 OFFSET $' + (params.length + 1), [...params, (page - 1) * 50]);
  res.json({ rows: result.rows, total: count.rows[0].total, page });
}));
router.post('/:kind', handle(async (req, res) => {
  const c = config(req, res); if (!c) return;
  const values = validate(c, req.body);
  if (c.table === 'sales_routes' && values.store_code) {
    const match = await pool.query('SELECT 1 FROM sales WHERE store_code = $1 LIMIT 1', [values.store_code]);
    if (!match.rowCount) return res.status(400).json({ message: 'Код ТТ відсутній у базі продажів.' });
  }
  const keys = Object.keys(values);
  const extra = c.table === 'sales_routes' ? ', match_status' : '';
  const extraValue = c.table === 'sales_routes' ? ", 'pending'" : '';
  const result = await pool.query('INSERT INTO ' + c.table + ' (' + keys.join(',') + extra + ') VALUES (' + keys.map((_, i) => '$' + (i + 1)).join(',') + extraValue + ') RETURNING *', keys.map(k => values[k]));
  res.status(201).json(result.rows[0]);
}));
router.put('/:kind/:id', handle(async (req, res) => {
  const c = config(req, res); if (!c) return;
  const values = validate(c, req.body);
  const keys = Object.keys(values);
  const extra = c.table === 'sales_routes' ? ", match_status = 'pending', updated_at = now()" : '';
  const result = await pool.query('UPDATE ' + c.table + ' SET ' + keys.map((k, i) => k + ' = $' + (i + 1)).join(', ') + extra + ' WHERE id = $' + (keys.length + 1) + ' RETURNING *', [...keys.map(k => values[k]), req.params.id]);
  if (!result.rowCount) return res.status(404).json({ message: 'Запис не знайдено.' });
  res.json(result.rows[0]);
}));
router.delete('/:kind/:id', handle(async (req, res) => {
  const c = config(req, res); if (!c) return;
  const result = await pool.query('DELETE FROM ' + c.table + ' WHERE id = $1 RETURNING id', [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ message: 'Запис не знайдено.' });
  res.json({ success: true });
}));
export default router;
