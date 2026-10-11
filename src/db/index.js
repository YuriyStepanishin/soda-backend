import { Pool } from 'pg';
import 'dotenv/config';
import { TENANT_VALUES } from '../config/tenants.js';

const DB_TIMEZONE = process.env.DB_TIMEZONE || 'Europe/Kyiv';

const buildConnectionString = (rawConnectionString, envName) => {
  if (!rawConnectionString) {
    throw new Error(`${envName} is not set`);
  }

  try {
    const parsed = new URL(rawConnectionString);

    const useLibpqCompat = process.env.PG_USE_LIBPQ_COMPAT === 'true';

    if (useLibpqCompat) {
      parsed.searchParams.set('uselibpqcompat', 'true');

      if (!parsed.searchParams.has('sslmode')) {
        parsed.searchParams.set('sslmode', 'require');
      }
    } else {
      parsed.searchParams.set('sslmode', 'verify-full');
      parsed.searchParams.delete('uselibpqcompat');
    }

    parsed.searchParams.set('options', `-c timezone=${DB_TIMEZONE}`);

    return parsed.toString();
  } catch {
    return rawConnectionString;
  }
};

const createPool = (connectionString, envName) => {
  return new Pool({
    connectionString: buildConnectionString(connectionString, envName),
  });
};

export const pools = Object.fromEntries(
  TENANT_VALUES.map((tenant) => [
    tenant.id,
    createPool(process.env[tenant.databaseUrlEnv], tenant.databaseUrlEnv),
  ]),
);

export const getPool = (tenant) => {
  const db = pools[tenant];

  if (!db) {
    throw new Error(`Unknown tenant: ${tenant}`);
  }

  return db;
};

export const connectDatabases = async () => {
  for (const [tenant, db] of Object.entries(pools)) {
    try {
      const result = await db.query(`
        SELECT
          current_database(),
          current_schema()
      `);

      console.log(`✅ ${tenant.toUpperCase()} Neon підключено`);

      console.log(result.rows[0]);
    } catch (error) {
      console.error(
        `❌ Помилка підключення ${tenant.toUpperCase()} Neon:`,
        error.message,
      );

      throw error;
    }
  }
};
