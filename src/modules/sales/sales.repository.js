import { laskaSalesAdapter } from './adapters/laskaSalesAdapter.js';
import { olgatorgSalesAdapter } from './adapters/olgatorgSalesAdapter.js';

const adapters = {
  olgatorg: olgatorgSalesAdapter,
  laska: laskaSalesAdapter,
};

export const findSalesAdapter = (tenant) => adapters[tenant] || null;

export const findSalesOperation = (tenant, operation) =>
  findSalesAdapter(tenant)?.[operation] || null;
