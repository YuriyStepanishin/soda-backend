import { findSalesOperation } from './sales.repository.js';

export const getSalesOperation = (tenant, operation) =>
  findSalesOperation(tenant, operation);
