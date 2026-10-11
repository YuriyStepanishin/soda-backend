import { isValidTenant } from '../../config/tenants.js';
import { ROLES } from '../../constants/roles.js';

export const mapUserToSalesTenant = (user, requestedTenant) => {
  if (!requestedTenant || !isValidTenant(requestedTenant)) {
    return null;
  }

  // ADMIN може працювати з будь-яким зареєстрованим tenant.
  if (user?.role === ROLES.ADMIN) {
    return requestedTenant;
  }

  // Інші користувачі — тільки зі своїм tenant.
  if (requestedTenant === user?.tenant) {
    return requestedTenant;
  }

  return null;
};
