import { buildSalesWhere } from '../config/olgatorgUsers.js';
import { buildRequestWhere } from '../utils/buildRequestWhere.js';
import {
  findAllSales,
  findSaleById,
  countSales,
  getSalesSummary,
  getSalesTotals,
  getSalesDrilldown,
  getStoresSummary,
  getStoreProducts,
  getStoreDates,
  getSalesHierarchy,
  getFiltersData,
} from '../models/olgatorgSalesModel.js';

// Централізована нормалізація пагінації, щоб усі контролери працювали однаково.
const normalizePagination = (pagination = {}) => {
  const rawPage = Number(pagination.page);
  const rawLimit = Number(pagination.limit);

  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? rawLimit : 50;

  return { page, limit };
};

// Шар сервісу: поєднує role-based фільтр + запитні фільтри + модель продажів.
export const getAllSales = async (user, filters, pagination) => {
  const roleFilter = buildSalesWhere(user);
  const filter = buildRequestWhere(filters, roleFilter);
  const normalizedPagination = normalizePagination(pagination);

  const [sales, total] = await Promise.all([
    findAllSales(filter, normalizedPagination),
    countSales(filter),
  ]);

  return {
    sales,
    total,
    page: normalizedPagination.page,
    limit: normalizedPagination.limit,
  };
};

// Повертає агрегації для верхніх KPI-блоків.
export const getSummary = async (user, filters) => {
  const roleFilter = buildSalesWhere(user);
  const filter = buildRequestWhere(filters, roleFilter);

  const [summary, totals] = await Promise.all([
    getSalesSummary(filter),
    getSalesTotals(filter),
  ]);

  return {
    summary,
    totals,
  };
};

// Делегує drilldown у модель після накладання доступів користувача.
export const getDrilldown = async (user, groupBy, filters) => {
  const roleFilter = buildSalesWhere(user);
  const filter = buildRequestWhere(filters, roleFilter);

  return await getSalesDrilldown(groupBy, filter);
};

// Простий проксі до моделі для читання продажу по id.
export const getSale = async (id) => {
  return await findSaleById(id);
};
// Вітрина магазинів у межах доступної користувачу вибірки.
export const getStores = async (user, filters) => {
  const roleFilter = buildSalesWhere(user);
  const filter = buildRequestWhere(filters, roleFilter);

  return await getStoresSummary(filter);
};
// Вітрина продуктів у межах доступної користувачу вибірки.
export const getProducts = async (user, filters) => {
  const roleFilter = buildSalesWhere(user);
  const filter = buildRequestWhere(filters, roleFilter);

  return await getStoreProducts(filter);
};

// Вітрина дат у межах доступної користувачу вибірки.
export const getDates = async (user, filters) => {
  const roleFilter = buildSalesWhere(user);
  const filter = buildRequestWhere(filters, roleFilter);

  return await getStoreDates(filter);
};
// Дерево ієрархії для drilldown-компонентів.
export const getHierarchy = async (user, filters) => {
  const roleFilter = buildSalesWhere(user);
  const filter = buildRequestWhere(filters, roleFilter);

  return await getSalesHierarchy(filter);
};

// Дані для dropdown/checkbox фільтрів у frontend.
export const getFilters = async (user, filters = {}) => {
  const roleFilter = buildSalesWhere(user);

  return await getFiltersData(filters, roleFilter);
};
