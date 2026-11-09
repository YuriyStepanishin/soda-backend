export const cleanText = value => String(value ?? '').replace(/[\s\u00a0]+/g, ' ').trim();
export const textKey = value => cleanText(value).toLocaleLowerCase('uk-UA');

export function money(value) {
  const normalized = typeof value === 'number' ? value : Number(cleanText(value).replace(/\s/g, '').replace(',', '.'));
  if (value === null || value === undefined || cleanText(value) === '' || !Number.isFinite(normalized)) throw new Error('Некоректна сума');
  return Math.round(normalized * 100);
}

export function documentDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const match = cleanText(value).match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (!match) throw new Error('Некоректна дата накладної');
  const date = `${match[3]}-${match[2]}-${match[1]}`;
  if (new Date(date).toISOString().slice(0, 10) !== date) throw new Error('Некоректна дата накладної');
  return date;
}

export const routeKey = value => {
  const match = cleanText(value).match(/^ПТТ[\s-]*0*(\d+)(?:\D|$)/i);
  return match ? `ПТТ-${Number(match[1])}` : textKey(value).replace(/\s*@.*$/, '');
};

export function statusFor(days, balance, network) {
  if (balance < 0) return 'prepayment';
  if (balance <= 0 || network) return 'current';
  return days >= 21 ? 'penalty' : days >= 14 ? 'overdue' : 'current';
}

// Read only the hierarchical 1C export used by Зібрати_Дебет, never execute VBA.
export async function parseReceivables(source) {
  const documents = [];
  let route = '', store = '', totalCents = null;
  for await (const { row, rowNumber } of source) {
    const text = cleanText(row[0]);
    if (rowNumber === 12 && /Управлінська організація/i.test(text) && row[12] != null) totalCents = money(row[12]);
    if (rowNumber < 13 || !text) continue;
    if (/^ПТТ /i.test(text)) { route = text; store = ''; continue; }
    if (/^(Реализация товаров и услуг|Возврат товаров от клиента)/i.test(text)) {
      try {
        if (!route || !store || !cleanText(row[10])) throw new Error('Відсутні ПТТ, ТТ або номер');
        const days = Number(row[8]);
        // 1C leaves a zero-day invoice's cell blank.
        if (!Number.isInteger(days) || days < 0) throw new Error('Некоректний вік накладної');
        documents.push({ sourceRow: rowNumber, route, store, documentDate: documentDate(row[5]),
          sourceAgent: cleanText(row[3]), days, sourceOverdue: row[9] == null ? null : Number(row[9]),
          number: cleanText(row[10]), amountCents: row[11] == null ? null : money(row[11]), balanceCents: money(row[12]),
          type: /^Возврат/i.test(text) ? 'return' : 'sale' });
      } catch (error) { throw new Error(`Рядок ${rowNumber}: ${error.message}`); }
    } else if (route && !row[5] && !row[10] && !/Управлінська організація|Партнер\.Б[иі]знес-рег[иі]он|^Итого|^Разом|^Всього/i.test(text)) store = text;
  }
  if (!documents.length) throw new Error('Файл не містить накладних. Попередня дебіторка збережена.');
  // Partner-level adjustments and other document types can make the 1C grand
  // total differ from the macro's sale/return total. Preserve the discrepancy.
  return { documents, controlBalanceCents: totalCents };
}

// A route can occur in several branches. Never assign it using its number alone.
// An export manager must corroborate a current dictionary route. This also keeps
// older invoices with a former employee on the current route owner's account.
export function assignOwners(documents, agents) {
  const byName = new Map(agents.map(agent => [textKey(agent.ta), agent]));
  const routes = new Map();
  for (const row of documents) {
    if (!routes.has(row.route)) routes.set(row.route, new Map());
    const votes = routes.get(row.route);
    votes.set(textKey(row.sourceAgent), (votes.get(textKey(row.sourceAgent)) || 0) + 1);
  }
  const owners = new Map();
  for (const [route, votes] of routes) {
    const corroborated = agents.filter(agent => agent.route && routeKey(agent.route) === routeKey(route) && votes.has(textKey(agent.ta)));
    if (corroborated.length === 1) { owners.set(route, corroborated[0]); continue; }
    const [name, count] = [...votes].sort((a, b) => b[1] - a[1])[0];
    const total = [...votes.values()].reduce((a, b) => a + b, 0);
    const agent = byName.get(name);
    if (count > total / 2 && agent && (!agent.route || routeKey(agent.route) === routeKey(route))) owners.set(route, agent);
  }
  return documents.map(row => ({ ...row, agent: owners.get(row.route)?.ta || null, department: owners.get(row.route)?.department || null }));
}

export function requireReceivablesAccess(req, res, next) {
  const user = req.user;
  const tenant = req.headers['x-tenant-id'] || (user?.role !== 'admin' ? user?.tenant : null);
  if (tenant !== 'laska' || (user?.role !== 'admin' && user?.tenant !== 'laska') ||
      !['admin', 'manager', 'supervisor', 'agent'].includes(user?.role)) {
    return res.status(403).json({ message: 'Дебіторка доступна лише користувачам Ласки' });
  }
  next();
}

export function buildScope(user) {
  if (user.role === 'agent') return { sql: 'agent = $1', params: [user.representative || ''] };
  if (user.role === 'supervisor') return { sql: 'department = ANY($1::text[])', params: [user.departments || []] };
  if (['admin', 'manager'].includes(user.role)) return { sql: 'TRUE', params: [] };
  return { sql: 'FALSE', params: [] };
}
