const metrics = ['quantity', 'stores', 'weight', 'amount', 'sku'];
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;

// The SQL grand total is calculated over the original authorized rows.
export function shapeHierarchyReport(rows, reportBy) {
  const fields = reportBy.split(',');
  const total = rows.find(row => Number(row.level) === -1);
  if (!total) throw new Error('Report query did not return its grand total');
  const pickMetrics = row => Object.fromEntries(metrics.map(key => [key, number(row[key])]));
  return {
    success: true,
    reportBy,
    rows: rows.filter(row => Number(row.level) >= 0).map(row => {
      const level = Number(row.level);
      const dimensions = row.dimensions || {};
      const identity = fields.slice(0, level + 1).map(field => [field, dimensions[field] ?? null]);
      return {
        id: JSON.stringify(identity),
        label: String(row.label || 'Без назви'),
        path: row.path,
        level,
        dimensions,
        ...pickMetrics(row),
      };
    }),
    totals: { id: 'total', label: 'Разом', ...pickMetrics(total) },
  };
}
