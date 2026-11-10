import { Router } from 'express';
import { receivablesFilters } from './receivables.filters.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireReceivablesAccess } from './receivables.domain.js';
import { receivablesRepository, processReceivablesImports } from './receivables.service.js';
const router = Router();
router.use(authenticate, requireReceivablesAccess);
router.use((req,res,next) => {res.set('Cache-Control','no-store');next();});
router.get('/',async(req,res,next) => {
  try {
    const parsed = receivablesFilters.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({message:'Некоректні фільтри дебіторки'});
    res.json(await receivablesRepository.read(req.user,parsed.data));
  } catch(error) {next(error);}
});
router.post('/import',async(req,res,next) => {
  if (!['admin','manager'].includes(req.user.role)) return res.status(403).json({message:'Імпорт доступний керівнику та адміністратору'});
  try {res.json(await processReceivablesImports());} catch(error) {next(error);}
});
export default router;
