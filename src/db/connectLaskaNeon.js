import { Pool } from 'pg';
import 'dotenv/config';

export const laskaPool = new Pool({
  connectionString: process.env.LASKA_NEON_URL,
});

export const connectLaskaDB = async () => {
  try {
    const result = await laskaPool.query(`
      SELECT
        current_database(),
        current_schema(),
        to_regclass('public.sales_import') AS sales_import
    `);

    console.log('✅ LASKA Neon підключено');
    console.log(result.rows[0]);
  } catch (error) {
    console.error('❌ Помилка підключення до LASKA Neon:', error.message);
    throw error;
  }
};
