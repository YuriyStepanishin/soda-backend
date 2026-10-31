export const TENANTS = {
  OLGATORG: {
    id: 'olgatorg',
    name: 'OLGATORG',
    databaseUrlEnv: 'OLGATORG_NEON_URL',
  },
  LASKA: {
    id: 'laska',
    name: 'LASKA',
    databaseUrlEnv: 'LASKA_NEON_URL',
  },
};

export const TENANT_VALUES = Object.values(TENANTS);

export const TENANT_IDS = TENANT_VALUES.map((tenant) => tenant.id);

export const isValidTenant = (tenant) => typeof tenant === 'string' && TENANT_IDS.includes(tenant);
