import express from 'express';
import 'dotenv/config';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';

import { errors } from 'celebrate';
import { connectDB } from './db/connectOlgaTorgNeon.js';
import { logger } from './utils/logger.js';
import { registerImportSchedules } from './services/registerImportSchedules.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { errorHandler } from './middleware/errorHandler.js';
import { swaggerSpec } from './config/swagger.js';

import authRoutes from './routes/authRoutes.js';
import salesRoutes from './routes/olgatorgSalesRoutes.js';
import uploadRoutes from './routes/olgatorgUploadRoutes.js';
import googleDriveRoutes from './routes/olgatorgGoogleDriveRoutes.js';
import priceRoutes from './routes/olgatorgPriceRoutes.js';
import importRoutes from './routes/olgatorgImportRoutes.js';
import uploadPhotosRoutes from './routes/uploadPhotos.js';
import laskaDictionaryRoutes from './routes/laskaDictionaryRoutes.js';
import laskaSalesRoutes from './routes/laskaSalesRoutes.js';
import laskaUploadRoutes from './routes/laskaUploadRoutes.js';
import laskaImportRoutes from './routes/laskaImportRoutes.js';

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
app.use('/api/laska/dictionary', laskaDictionaryRoutes);
app.use('/api/laska/sales', laskaSalesRoutes);
app.use('/api/laska/upload', laskaUploadRoutes);
app.use('/api/laska/imports', laskaImportRoutes);

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
  registerImportSchedules();

  app.listen(PORT, () => {
    console.log(`Сервер запущено на порту ${PORT}`);
  });
} catch (error) {
  console.error('Помилка підключення до БД:', error);
  process.exit(1);
}
