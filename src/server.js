import express from 'express';
import 'dotenv/config';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import cron from 'node-cron';

import { errors } from 'celebrate';
import { connectDB } from './db/connectNeon.js';
import { logger } from './utils/logger.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { errorHandler } from './middleware/errorHandler.js';
import { swaggerSpec } from './config/swagger.js';
import { processGoogleDriveImports } from './services/processGoogleDriveImports.js';

import authRoutes from './routes/authRoutes.js';
import salesRoutes from './routes/salesRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';
import googleDriveRoutes from './routes/googleDriveRoutes.js';
import priceRoutes from './routes/priceRoutes.js';
import importRoutes from './routes/importRoutes.js';
import uploadPhotosRoutes from './routes/uploadPhotos.js';

const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Europe/Kyiv';
process.env.TZ = process.env.TZ || APP_TIMEZONE;
const IMPORT_CRON_ENABLED =
  (process.env.IMPORT_CRON_ENABLED || 'true').toLowerCase() === 'true';
const IMPORT_CRON_SCHEDULE = process.env.IMPORT_CRON_SCHEDULE || '*/5 * * * *';

let isImportRunning = false;

const app = express();
const PORT = process.env.PORT || 3000;

app.use(logger); // Логування запитів
app.use(express.json()); // Дозволяє обробляти JSON в тілі запиту
app.use(cors()); // Дозволяє запити з будь-яких джерел
app.use(cookieParser()); // Дозволяє обробляти cookies
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/api-docs.json', (req, res) => {
  res.json(swaggerSpec);
});

// Маршрут
app.use('/api/auth', authRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/upload/photos', uploadPhotosRoutes);
app.use('/api/google-drive', googleDriveRoutes);
app.use('/api/prices', priceRoutes);
app.use('/api/imports', importRoutes);

app.get('/', (req, res) => {
  res.json({
    message: 'SODA API працює',
  });
});

app.use(notFoundHandler); // Обробка неіснуючих маршрутів
app.use(errors()); // Обробка помилок валідації від celebrate
app.use(errorHandler); // Глобальний обробник помилок

try {
  await connectDB();

  if (IMPORT_CRON_ENABLED) {
    cron.schedule(
      IMPORT_CRON_SCHEDULE,
      async () => {
        if (isImportRunning) {
          console.log(
            '[Import Cron] Previous run still in progress, skip tick',
          );

          return;
        }

        isImportRunning = true;

        try {
          const summary = await processGoogleDriveImports();

          console.log('[Import Cron] Completed:', summary);
        } catch (error) {
          console.error('[Import Cron] Failed:', error.message);
        } finally {
          isImportRunning = false;
        }
      },
      {
        timezone: APP_TIMEZONE,
      },
    );

    console.log(
      `[Import Cron] Enabled with schedule "${IMPORT_CRON_SCHEDULE}" (${APP_TIMEZONE})`,
    );
  }

  app.listen(PORT, () => {
    console.log(`Сервер запущено на порту ${PORT}`);
  });
} catch (error) {
  console.error('Помилка підключення до БД:', error);
  process.exit(1);
}
