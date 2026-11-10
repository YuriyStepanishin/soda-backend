import { z } from 'zod';

const jsonParameter = schema => z.string().max(40000).transform((value, context) => {
  try { return JSON.parse(value); }
  catch { context.addIssue({ code: 'custom', message: 'Некоректний JSON фільтра' }); return z.NEVER; }
}).pipe(schema);
const status = z.enum(['current', 'overdue', 'penalty', 'prepayment']);
export const receivablesFilters = z.object({
  agent: z.string().max(200).optional(), route: z.string().max(200).optional(),
  representatives: jsonParameter(z.array(z.object({agent: z.string().max(200).nullable(), route: z.string().max(200)}).strict()).max(100)).optional(),
  statuses: jsonParameter(z.array(status).max(4)).optional(),
  search: z.string().max(200).optional(), status: status.optional(),
  page: z.coerce.number().int().min(1).max(100000).optional(),
}).strict();

// Preserve each agent/route pair. Separate IN lists would accidentally combine
// the selected agent from one pair with the selected route from another.
export function representativeCondition(index) {
  return `EXISTS (SELECT 1 FROM jsonb_to_recordset($${index}::jsonb) AS selected(agent text,route text)
    WHERE laska_receivables.agent IS NOT DISTINCT FROM selected.agent AND laska_receivables.route = selected.route)`;
}
