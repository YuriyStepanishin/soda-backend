const appendCondition = (parts, params, clause, value) => {
  params.push(value);
  parts.push(clause(params.length));
};

const normalizeFilterValues = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

export const buildRequestWhere = (filters = {}, roleFilter) => {
  const whereParts = [];
  const params = [];

  // Рольова фільтрація
  if (roleFilter?.where) {
    whereParts.push(roleFilter.where.replace(/^WHERE\s+/i, ''));
    params.push(...roleFilter.params);
  }

  // ==========================
  // Співробітники
  // ==========================

  const departments = normalizeFilterValues(filters.department);
  const agents = normalizeFilterValues(filters.agent);
  const stores = normalizeFilterValues(filters.stores);

  if (departments.length) {
    params.push(departments);
    whereParts.push(`department = ANY($${params.length})`);
  }

  if (agents.length) {
    params.push(agents);
    whereParts.push(`agent_name = ANY($${params.length})`);
  }

  if (stores.length) {
    params.push(stores);
    whereParts.push(`alt_name = ANY($${params.length})`);
  }

  // ==========================
  // Товари
  // ==========================

  const brands = normalizeFilterValues(filters.brands);
  const products = normalizeFilterValues(filters.products);

  if (brands.length) {
    params.push(brands);
    whereParts.push(`tm = ANY($${params.length})`);
  }

  if (products.length) {
    params.push(products);
    whereParts.push(`product_name = ANY($${params.length})`);
  }

  // ==========================
  // Дати
  // ==========================

  const dateFrom =
    typeof filters.dateFrom === 'string' ? filters.dateFrom.trim() : '';

  const dateTo =
    typeof filters.dateTo === 'string' ? filters.dateTo.trim() : '';

  if (dateFrom) {
    appendCondition(
      whereParts,
      params,
      (index) => `sale_date >= $${index}::date`,
      dateFrom,
    );
  }

  if (dateTo) {
    appendCondition(
      whereParts,
      params,
      (index) => `sale_date <= $${index}::date`,
      dateTo,
    );
  }

  // ==========================
  // Пошук
  // ==========================

  const storeSearch =
    typeof filters.storeSearch === 'string' ? filters.storeSearch.trim() : '';

  if (storeSearch) {
    appendCondition(
      whereParts,
      params,
      (index) => `alt_name ILIKE $${index}`,
      `%${storeSearch}%`,
    );
  }

  const search =
    typeof filters.search === 'string' ? filters.search.trim() : '';

  if (search) {
    appendCondition(
      whereParts,
      params,
      (index) =>
        `(product_name ILIKE $${index}
          OR client_name ILIKE $${index}
          OR outlet_name ILIKE $${index}
          OR barcode::text ILIKE $${index})`,
      `%${search}%`,
    );
  }

  return {
    where: whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '',
    params,
  };
};
