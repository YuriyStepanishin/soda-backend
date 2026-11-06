import { z } from 'zod';
export const DIRECTIONS = ['АКБ', 'Асортимент', 'Мерчандайзинг', 'Дебіторка'];
export const STATUSES = ['підтверджено', 'проблема', 'не перевірено'];
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}, 'Некоректна календарна дата');
const optionalDate = z.union([date, z.literal('')]).default('');
const text = z.string().trim().max(2000).default('');
const result = z.object({
  id: z.string().min(1).max(100), agent: z.string().min(1).max(100),
  route: z.string().trim().min(1).max(200), date,
  direction: z.enum(DIRECTIONS), status: z.enum(STATUSES),
  actual: z.number().finite().min(0).nullable(), target: z.number().finite().positive().nullable(),
  evidence: text, owner: z.string().trim().max(200).default(''), recheck: optionalDate,
  issue: text, note: text, invoiceDate: optionalDate,
  term: z.number().int().min(0).max(365).default(14),
  balance: z.union([z.number().finite(), z.literal('')]).default(''),
}).superRefine((r, ctx) => {
  if (r.status === 'підтверджено' && (r.actual === null || r.target === null || !r.evidence || !r.owner)) {
    ctx.addIssue({ code: 'custom', message: 'Для підтвердження потрібні факт, ціль, джерело та відповідальний' });
  }
});
export const stateSchema = z.object({
  agents: z.array(z.object({ id: z.string().min(1).max(100), name: z.string().trim().min(1).max(200) })).length(10),
  records: z.array(result).max(10000),
  budget: z.number().finite().min(0).max(1000000), buffer: z.number().int().min(0).max(90),
}).superRefine((data, ctx) => {
  const ids = new Set(data.agents.map(a => a.id));
  if (ids.size !== 10 || new Set(data.records.map(r => r.id)).size !== data.records.length || data.records.some(r => !ids.has(r.agent))) {
    ctx.addIssue({ code: 'custom', message: 'Перевірте унікальні ID агентів, записів та прив’язку результатів' });
  }
});
export const writeSchema = z.object({ data: stateSchema, revision: z.number().int().min(0), action: z.string().trim().min(1).max(200) });
export function initialState() {
  return { agents: Array.from({ length: 10 }, (_, i) => ({ id: String(i + 1), name: `Агент ${String(i + 1).padStart(2, '0')}` })), records: [], budget: 15000, buffer: 7 };
}
export function requireMotivationAccess(req, res, next) {
  const requested = req.headers['x-tenant-id'];
  if (requested !== undefined && requested !== 'laska') return res.status(400).json({ message: 'Мотивація доступна лише для однієї компанії: laska' });
  if (!['admin', 'manager'].includes(req.user?.role) || (req.user.role !== 'admin' && req.user.tenant !== 'laska')) {
    return res.status(403).json({ message: 'Контроль мотивації доступний адміністратору та менеджеру Ласки' });
  }
  if (req.user.role === 'admin' && requested !== 'laska') return res.status(400).json({ message: 'Оберіть компанію Ласка' });
  next();
}
