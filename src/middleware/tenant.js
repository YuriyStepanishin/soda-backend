import { isValidTenant } from '../config/tenants.js';
import { mapUserToSalesTenant } from '../modules/sales/sales.mapper.js';
import { findSalesAdapter } from '../modules/sales/sales.repository.js';
import { ROLES } from '../constants/roles.js';

export const resolveSalesTenant = () => (req, res, next) => {
  const requestedTenant =
    req.headers['x-tenant-id'] ||
    (req.user.role !== ROLES.ADMIN ? req.user.tenant : null);

  const tenant = mapUserToSalesTenant(req.user, requestedTenant);

  if (!tenant) {
    return res.status(403).json({
      success: false,
      message: 'Sales access denied for this tenant',
    });
  }

  const adapter = findSalesAdapter(tenant);

  if (
    !adapter ||
    (adapter.allowedRoles && !adapter.allowedRoles.includes(req.user.role))
  ) {
    return res.status(403).json({
      success: false,
      message: 'Sales access denied for this tenant',
    });
  }

  req.salesTenant = tenant;
  req.salesAdapter = adapter;

  return next();
};

export const validateSalesTenantHeader = (req, res, next) => {
  const tenant = req.headers['x-tenant-id'];
  if (tenant !== undefined && !isValidTenant(tenant)) {
    return res.status(400).json({ success: false, message: 'Select exactly one company: olgatorg or laska' });
  }
  return next();
};
