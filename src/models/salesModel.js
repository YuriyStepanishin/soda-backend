import { pool } from '../db/connectNeon.js';
import { buildRequestWhere } from '../utils/buildRequestWhere.js';

const SALES_INSERT_QUERY = `
  INSERT INTO sales (
    sale_date,
    tm,
    product_name,
    barcode,
    weight,
    qty,
    amount,
    client_code,
    client_name,
    address,
    outlet_name,
    outlet_code,
    agent_name,
    month,
    volume,
    outlet_type,
    supervisor_name,
    price,
    discount,
    alt_name,
    price_type
  )
  VALUES (
    $1,$2,$3,$4,$5,
    $6,$7,$8,$9,$10,
    $11,$12,$13,$14,$15,
    $16,$17,$18,$19,$20,$21
  )
`;

const getSalesValues = (row) => [
  row.sale_date,
  row.tm,
  row.product_name,
  row.barcode,
  row.weight,
  row.qty,
  row.amount,
  row.client_code,
  row.client_name,
  row.address,
  row.outlet_name,
  row.outlet_code,
  row.agent_name,
  row.month,
  row.volume,
  row.outlet_type,
  row.supervisor_name,
  row.price,
  row.discount,
  row.alt_name,
  row.price_type,
];

export const findAllSales = async (filter, { page, limit }) => {
  const offset = (page - 1) * limit;

  const result = await pool.query(
    `
    SELECT *
    FROM sales
    ${filter.where}
  ORDER BY sale_date DESC, id DESC
    LIMIT $${filter.params.length + 1}
    OFFSET $${filter.params.length + 2}
    `,
    [...filter.params, limit, offset],
  );

  return result.rows;
};

export const getSalesMeta = async (filter) => {
  const result = await pool.query(
    `
    SELECT DISTINCT tm, agent_name, supervisor_name
    FROM sales
    ${filter.where}
    `,
    filter.params,
  );

  return {
    tm: result.rows.map((row) => row.tm),
    agent_name: result.rows.map((row) => row.agent_name),
    supervisor_name: result.rows.map((row) => row.supervisor_name),
  };
};

export const countSales = async (filter) => {
  const result = await pool.query(
    `
    SELECT COUNT(*)::INT AS total
    FROM sales
    ${filter.where}
    `,
    filter.params,
  );

  return result.rows[0].total;
};

export const findSaleById = async (id) => {
  const result = await pool.query(
    `
    SELECT *
    FROM sales
    WHERE id = $1
    `,
    [id],
  );

  return result.rows[0];
};

export const getSalesByPeriod = async (dateFrom, dateTo) => {
  const result = await pool.query(
    `
    SELECT *
    FROM sales
    WHERE sale_date BETWEEN $1 AND $2
    ORDER BY sale_date DESC, id DESC
    `,
    [dateFrom, dateTo],
  );

  return result.rows;
};

export const deleteAllSales = async () => {
  await pool.query('TRUNCATE TABLE sales RESTART IDENTITY');
};

export const getSalesCount = async () => {
  const result = await pool.query(`
    SELECT COUNT(*)::INT AS total
    FROM sales
  `);

  return result.rows[0].total;
};

export const insertSalesBatch = async (rows) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const row of rows) {
      await client.query(SALES_INSERT_QUERY, getSalesValues(row));
    }

    await client.query('COMMIT');

    return rows.length;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const replaceAllSales = async (rows) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query('TRUNCATE TABLE sales RESTART IDENTITY');

    for (const row of rows) {
      await client.query(SALES_INSERT_QUERY, getSalesValues(row));
    }

    await client.query('COMMIT');

    return rows.length;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
export const getSalesSummary = async (filter) => {
  const result = await pool.query(
    `
    WITH brand_sales AS (
      SELECT
        tm,
        COALESCE(outlet_code, client_code) AS outlet_id,
        SUM(amount) AS outlet_amount,
       SUM(qty * weight) AS outlet_weight
      FROM sales
      ${filter.where}
      GROUP BY
        tm,
        COALESCE(outlet_code, client_code)
    )

    SELECT
      tm,
      COUNT(DISTINCT outlet_id)::int AS stores,
      ROUND(SUM(outlet_weight)::numeric, 2) AS weight,
      ROUND(SUM(outlet_amount)::numeric, 2) AS amount
    FROM brand_sales
    GROUP BY tm
    ORDER BY amount DESC
    `,
    filter.params,
  );

  return result.rows;
};

export const getSalesTotals = async (filter) => {
  const result = await pool.query(
    `
    WITH brand_sales AS (
      SELECT
        tm,
        COALESCE(outlet_code, client_code) AS outlet_id,
        SUM(amount) AS outlet_amount,
       SUM(qty * weight) AS outlet_weight
      FROM sales
      ${filter.where}
      GROUP BY
        tm,
        COALESCE(outlet_code, client_code)
    )

    SELECT
      COUNT(DISTINCT outlet_id)::int AS stores,

      ROUND(SUM(outlet_weight)::numeric, 2) AS weight,

      ROUND(SUM(outlet_amount)::numeric, 2) AS amount

    FROM brand_sales
    `,
    filter.params,
  );

  return result.rows[0];
};
export const getStoresSummary = async (filter) => {
  const result = await pool.query(
    `
    SELECT
      alt_name AS name,

      ROUND(SUM(amount)::numeric, 2) AS sum,

      ROUND(SUM(qty)::numeric, 2) AS quantity,

      ROUND(SUM(qty * weight)::numeric, 2) AS weight,

      COUNT(DISTINCT product_name)::int AS sku

    FROM sales

    ${filter.where}

    GROUP BY alt_name

    ORDER BY sum DESC
    `,
    filter.params,
  );

  return result.rows;
};
export const getStoreProducts = async (filter) => {
  const result = await pool.query(
    `
    SELECT
      product_name AS name,
      ROUND(SUM(qty)::numeric, 2) AS quantity,
      ROUND(SUM(amount)::numeric, 2) AS amount

    FROM sales

    ${filter.where}

    GROUP BY product_name

    ORDER BY amount DESC
    `,
    filter.params,
  );

  return result.rows;
};

export const getStoreDates = async (filter) => {
  const result = await pool.query(
    `
    SELECT
      alt_name AS store_name,
      sale_date,
      ROUND(SUM(amount)::numeric, 2) AS sum,
      ROUND(SUM(qty)::numeric, 2) AS quantity,
      ROUND(SUM(qty * weight)::numeric, 2) AS weight,
      COUNT(DISTINCT product_name)::int AS sku

    FROM sales

    ${filter.where}

    GROUP BY
      alt_name,
      sale_date

    ORDER BY
      store_name,
      sale_date DESC
    `,
    filter.params,
  );

  return result.rows;
};

export const getStoresHierarchy = async (filter) => {
  const result = await pool.query(
    `
   SELECT
  department,
  agent_name,
  sale_date,

  alt_name AS store_name,

  tm,
  product_name,

  ROUND(SUM(amount)::numeric, 2) AS amount,
  ROUND(SUM(qty)::numeric, 2) AS quantity,
  ROUND(SUM(qty * weight)::numeric, 2) AS weight

FROM sales

${filter.where}

GROUP BY
  department,
  agent_name,
  sale_date,
  alt_name,
  tm,
  product_name
    `,
    filter.params,
  );

  return result.rows;
};

export const getSalesHierarchy = async (filter) => {
  const result = await pool.query(
    `
    SELECT
      department,
      agent_name,

      sale_date,

      alt_name AS store_name,

      ROUND(SUM(amount)::numeric, 2) AS amount,
      ROUND(SUM(qty)::numeric, 2) AS quantity,
      ROUND(SUM(qty * weight)::numeric, 2) AS weight,

      COUNT(DISTINCT product_name)::int AS sku

    FROM sales

    ${filter.where}

    GROUP BY
      department,
      agent_name,
      sale_date,
      alt_name

    ORDER BY
      department,
      agent_name,
      sale_date DESC
    `,
    filter.params,
  );
  const departmentsMap = {};

  result.rows.forEach((row) => {
    const departmentName = row.department || 'Без відділу';
    const agentName = row.agent_name || 'Без агента';
    const dateKey = row.sale_date
      ? row.sale_date.toISOString().slice(0, 10)
      : '';

    if (!departmentsMap[departmentName]) {
      departmentsMap[departmentName] = {
        name: departmentName,
        sum: 0,
        quantity: 0,
        weight: 0,
        stores: new Set(),
        agents: {},
      };
    }

    const department = departmentsMap[departmentName];

    department.sum += Number(row.amount);
    department.quantity += Number(row.quantity);
    department.weight += Number(row.weight);
    department.stores.add(row.store_name);

    if (!department.agents[agentName]) {
      department.agents[agentName] = {
        name: agentName,
        sum: 0,
        quantity: 0,
        weight: 0,
        stores: new Set(),
        dates: [],
      };
    }

    const agent = department.agents[agentName];

    agent.sum += Number(row.amount);
    agent.quantity += Number(row.quantity);
    agent.weight += Number(row.weight);
    agent.stores.add(row.store_name);

    if (!agent.dates[dateKey]) {
      agent.dates[dateKey] = {
        key: dateKey,
        sum: 0,
        quantity: 0,
        weight: 0,
        stores: [],
      };
    }

    const date = agent.dates[dateKey];

    date.sum += Number(row.amount);
    date.quantity += Number(row.quantity);
    date.weight += Number(row.weight);

    date.stores.push({
      name: row.store_name,
      sum: Number(row.amount),
      quantity: Number(row.quantity),
      weight: Number(row.weight),
      sku: row.sku,
    });
  });

  return Object.values(departmentsMap).map((department) => ({
    name: department.name,
    sum: department.sum,
    quantity: department.quantity,
    weight: department.weight,
    stores: department.stores.size,
    agents: Object.values(department.agents).map((agent) => ({
      name: agent.name,
      sum: agent.sum,
      quantity: agent.quantity,
      weight: agent.weight,
      stores: agent.stores.size,
      dates: Object.values(agent.dates),
    })),
  }));
};

const buildFilter = (filters, roleFilter, field) =>
  buildRequestWhere(
    {
      ...filters,
      [field]: [],
    },
    roleFilter,
  );

const getDepartments = async (filter) => {
  const result = await pool.query(
    `
    SELECT DISTINCT department
    FROM sales
    ${filter.where}
    ORDER BY department
    `,
    filter.params,
  );

  return result.rows.map((r) => r.department).filter(Boolean);
};

const getAgents = async (filter) => {
  const result = await pool.query(
    `
    SELECT DISTINCT agent_name
    FROM sales
    ${filter.where}
    ORDER BY agent_name
    `,
    filter.params,
  );

  return result.rows.map((r) => r.agent_name).filter(Boolean);
};

const getStores = async (filter) => {
  const result = await pool.query(
    `
    SELECT DISTINCT alt_name
    FROM sales
    ${filter.where}
    ORDER BY alt_name
    `,
    filter.params,
  );

  return result.rows.map((r) => r.alt_name).filter(Boolean);
};

const getAgentsByDepartment = async (filter) => {
  const result = await pool.query(
    `
    SELECT DISTINCT department, agent_name
    FROM sales
    ${filter.where}
    ORDER BY department, agent_name
    `,
    filter.params,
  );

  const agentsByDepartment = {};

  result.rows.forEach((row) => {
    if (!row.department || !row.agent_name) return;

    if (!agentsByDepartment[row.department]) {
      agentsByDepartment[row.department] = [];
    }

    agentsByDepartment[row.department].push(row.agent_name);
  });

  return agentsByDepartment;
};

const getEmployeeFilters = async (filters, roleFilter) => {
  const departmentsFilter = buildFilter(filters, roleFilter, 'department');
  const agentsFilter = buildFilter(filters, roleFilter, 'agent');
  const storesFilter = buildFilter(filters, roleFilter, 'stores');

  const [departments, agents, stores, agentsByDepartment] =
    await Promise.all([
      getDepartments(departmentsFilter),
      getAgents(agentsFilter),
      getStores(storesFilter),
      getAgentsByDepartment(agentsFilter),
    ]);

  return {
    departments,
    agents,
    agentsByDepartment,
    stores,
  };
};


const getBrands = async (filter) => {
  const result = await pool.query(
    `
    SELECT DISTINCT tm
    FROM sales
    ${filter.where}
    ORDER BY tm
    `,
    filter.params,
  );

  return result.rows.map((r) => r.tm).filter(Boolean);
};

const getProducts = async (filter) => {
  const result = await pool.query(
    `
    SELECT DISTINCT product_name
    FROM sales
    ${filter.where}
    ORDER BY product_name
    `,
    filter.params,
  );

  return result.rows.map((r) => r.product_name).filter(Boolean);
};


const getProductFilters = async (filters, roleFilter) => {
  const brandsFilter = buildRequestWhere(
    {
      brands: [],
      products: [],
      department: [],
      agent: [],
      stores: [],
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
    },
    roleFilter,
  );

  const productsFilter = buildRequestWhere(
    {
      brands: filters.brands,
      products: [],
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
    },
    roleFilter,
  );

  const [brands, products] = await Promise.all([
    getBrands(brandsFilter),
    getProducts(productsFilter),
  ]);

  return {
    brands,
    products,
  };
};



export const getFiltersData = async (filters, roleFilter) => {
  const [employeeFilters, productFilters] = await Promise.all([
    getEmployeeFilters(filters, roleFilter),
    getProductFilters(filters, roleFilter),
  ]);

  return {
    ...employeeFilters,
    ...productFilters,
  };
};
