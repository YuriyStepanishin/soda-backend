import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { getPool } from '../../db/index.js';
import { writeSchema, requireMotivationAccess } from './motivation.domain.js';
import { createMotivationRepository } from './motivation.repository.js';
const router = Router();
let repository;
const repo = () => repository ||= createMotivationRepository(getPool('laska'));
router.use(authenticate, requireMotivationAccess);
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
const handler = fn => async (req, res, next) => {
  try { await fn(req, res); } catch (error) {
    if (error.status === 409) return res.status(409).json({ message: error.message });
    return next(error);
  }
};
router.get('/state', handler(async (req, res) => res.json(await repo().read())));
router.post('/state', handler(async (req, res) => {
  const parsed = writeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Некоректний результат перевірки' });
  res.json(await repo().write(parsed.data, req.user.email));
}));
router.get('/history', handler(async (req, res) => {
  const before = req.query.before;
  if (before !== undefined && (typeof before !== 'string' || !/^\d+$/.test(before) || !Number.isSafeInteger(Number(before)))) return res.status(400).json({ message: 'Некоректна сторінка історії' });
  res.json(await repo().history(before === undefined ? null : Number(before)));
}));
router.get('/history/:id', handler(async (req, res) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)) return res.status(400).json({ message: 'Некоректний ID знімка' });
  const snapshot = await repo().snapshot(req.params.id);
  if (!snapshot) return res.status(404).json({ message: 'Знімок не знайдено' });
  res.json(snapshot);
}));
export default router;
