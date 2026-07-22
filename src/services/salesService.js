import { buildSalesWhere } from '../config/users.js';
import { buildRequestWhere } from '../utils/buildRequestWhere.js';
import {
  findAllSales,
  findSaleById,
  countSales,
  getSalesSummary,
  getSalesTotals,
  getStoresSummary,
  getStoreProducts,
  getStoreDates,
  getSalesHierarchy,
  getFiltersData,
} from '../models/salesModel.js';

const normalizePagination = (pagination = {}) => {
  const rawPage = Number(pagination.page);
  const rawLimit = Number(pagination.limit);

  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? rawLimit : 50;

  return { page, limit };
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

export const getSummary = async (user, filters) => {
  const roleFilter = buildSalesWhere(user);
  const filter = buildRequestWhere(filters, roleFilter);

  const summary = await getSalesSummary(filter);
  const totals = await getSalesTotals(filter);

  return {
    summary,
    totals,
  };
};

export const getSale = async (id) => {
  return await findSaleById(id);
};
export const getStores = async (user, filters) => {
  const roleFilter = buildSalesWhere(user);
  const filter = buildRequestWhere(filters, roleFilter);

  return await getStoresSummary(filter);
};
export const getProducts = async (user, filters) => {
  const roleFilter = buildSalesWhere(user);
  const filter = buildRequestWhere(filters, roleFilter);

  return await getStoreProducts(filter);
};

export const getDates = async (user, filters) => {
  const roleFilter = buildSalesWhere(user);
  const filter = buildRequestWhere(filters, roleFilter);

  return await getStoreDates(filter);
};
export const getHierarchy = async (user, filters) => {
  const roleFilter = buildSalesWhere(user);
  const filter = buildRequestWhere(filters, roleFilter);

  return await getSalesHierarchy(filter);
};

export const getFilters = async (user, filters = {}) => {
  const roleFilter = buildSalesWhere(user);

  return await getFiltersData(filters, roleFilter);
};
