import { laskaPool } from '../db/connectLaskaNeon.js';

const formatDateForApi = (value) => {
  if (!value) return value;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('uk-UA', {
    timeZone: 'Europe/Kyiv',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
};

export const getLaskaSales = async (req, res) => {
  try {
    const {
      dateFrom,
      dateTo,
      ta,
      department,
      route,
      storeCode,
      manufacturer,
      tm,
      group,
      subgroup,
    } = req.query;

    const conditions = [];
    const params = [];

    const addFilter = (condition, value) => {
      params.push(value);
      conditions.push(condition.replace('?', `$${params.length}`));
    };

    if (dateFrom) {
      addFilter(`"Дата" >= ?`, dateFrom);
    }

    if (dateTo) {
      addFilter(`"Дата" <= ?`, dateTo);
    }

    if (ta) {
      addFilter(`"ТА" = ?`, ta);
    }

    if (department) {
      addFilter(`"Відділ" = ?`, department);
    }

    if (route) {
      addFilter(`"Маршрут" = ?`, route);
    }

    if (storeCode) {
      addFilter(`"Код ТТ" = ?`, storeCode);
    }

    if (manufacturer) {
      addFilter(`"Виробник" = ?`, manufacturer);
    }

    if (tm) {
      addFilter(`"ТМ" = ?`, tm);
    }

    if (group) {
      addFilter(`"Група" = ?`, group);
    }

    if (subgroup) {
      addFilter(`"Підгрупа" = ?`, subgroup);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT *
      FROM public.sales_laska
      ${where}
      ORDER BY "Дата" DESC, "ТА", "ТТ"
    `;

    const result = await laskaPool.query(query, params);
    const data = result.rows.map((row) => ({
      ...row,
      Дата: formatDateForApi(row['Дата']),
    }));

    res.json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    console.error('[LASKA SALES ERROR]', error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
