import express from 'express';
import dotenv from 'dotenv/config';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import { errors } from 'celebrate';
import { connectDB } from './db/connectNeon.js';
import { logger } from './utils/logger.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { errorHandler } from './middleware/errorHandler.js';

import authRoutes from './routes/authRoutes.js';
import salesRoutes from './routes/salesRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';
// import userRoutes from './routes/userRoutes.js';
import googleDriveRoutes from './routes/googleDriveRoutes.js';
import priceRoutes from './routes/priceRoutes.js';
import importRoutes from './routes/importRoutes.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(logger); // Логування запитів
app.use(express.json()); // Дозволяє обробляти JSON в тілі запиту
app.use(cors()); // Дозволяє запити з будь-яких джерел
app.use(cookieParser()); // Дозволяє обробляти cookies

// Маршрут
app.use('/api/auth', authRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/google-drive', googleDriveRoutes);
app.use('/api/prices', priceRoutes);
app.use('/api/imports', importRoutes);
// app.use('/api/users', userRoutes);

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

  app.listen(PORT, () => {
    console.log(`Сервер запущено на порту ${PORT}`);
  });
} catch (error) {
  console.error('Помилка підключення до БД:', error);
  process.exit(1);
}
