import { buildSalesWhere } from '../config/users.js';
import {
  findAllSales,
  findSaleById,
  countSales,
} from '../models/salesModel.js';

const normalizePagination = (pagination = {}) => {
  const rawPage = Number(pagination.page);
  const rawLimit = Number(pagination.limit);

  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? rawLimit : 50;

  return { page, limit };
};

const appendCondition = (parts, params, clause, value) => {
  params.push(value);
  parts.push(clause(params.length));
};

const buildRequestWhere = (filters = {}, baseFilter) => {
  const whereParts = [];
  const params = [];

  if (baseFilter?.where) {
    whereParts.push(baseFilter.where.replace(/^WHERE\s+/i, ''));
    params.push(...baseFilter.params);
  }

  const search =
    typeof filters.search === 'string' ? filters.search.trim() : '';
  const brand = typeof filters.brand === 'string' ? filters.brand.trim() : '';
  const agent = typeof filters.agent === 'string' ? filters.agent.trim() : '';
  const dateFrom =
    typeof filters.dateFrom === 'string' ? filters.dateFrom.trim() : '';
  const dateTo =
    typeof filters.dateTo === 'string' ? filters.dateTo.trim() : '';

  if (brand) {
    appendCondition(
      whereParts,
      params,
      (index) => `tm ILIKE $${index}`,
      `%${brand}%`,
    );
  }

  if (agent) {
    appendCondition(
      whereParts,
      params,
      (index) => `agent_name ILIKE $${index}`,
      `%${agent}%`,
    );
  }

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

  if (search) {
    appendCondition(
      whereParts,
      params,
      (index) =>
        `(product_name ILIKE $${index} OR client_name ILIKE $${index} OR outlet_name ILIKE $${index} OR barcode::text ILIKE $${index})`,
      `%${search}%`,
    );
  }

  return {
    where: whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '',
    params,
  };
};

export const getAllSales = async (user, filters, pagination) => {
  const roleFilter = buildSalesWhere(user);
  const filter = buildRequestWhere(filters, roleFilter);
  const normalizedPagination = normalizePagination(pagination);

  const sales = await findAllSales(filter, normalizedPagination);

  const total = await countSales(filter);

  return {
    sales,
    total,
    page: normalizedPagination.page,
    limit: normalizedPagination.limit,
  };
};

export const getSale = async (id) => {
  return await findSaleById(id);
};
