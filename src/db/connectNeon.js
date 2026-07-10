import { Pool } from 'pg';
import 'dotenv/config';

const DB_TIMEZONE = process.env.DB_TIMEZONE || 'Europe/Kyiv';

const buildConnectionString = (rawConnectionString) => {
  if (!rawConnectionString) {
    throw new Error('NEON_URL is not set');
  }

  try {
    const parsed = new URL(rawConnectionString);
    const useLibpqCompat = process.env.PG_USE_LIBPQ_COMPAT === 'true';

    // Avoid pg warning and keep TLS behavior explicit.
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

export const pool = new Pool({
  connectionString: buildConnectionString(process.env.NEON_URL),
});

export const connectDB = async () => {
  try {
    const result = await pool.query('SELECT NOW()');

    console.log("✅ З'єднання з PostgreSQL успішно встановлено");
    console.log(result.rows[0]);
  } catch (error) {
    console.error('❌ Помилка підключення до PostgreSQL:', error.message);
    process.exit(1);
  }
};
