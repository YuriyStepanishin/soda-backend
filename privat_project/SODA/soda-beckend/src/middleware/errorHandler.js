import { HttpError } from 'http-errors';

export const errorHandler = (err, req, res, next) => {
  console.error('Error Middleware:', err);

  if (err instanceof HttpError) {
    return res
      .status(err.statusCode)
      .json({ message: err.message || err.name });
  }

  const isProd = process.env.NODE_ENV === 'production';

  res.status(500).json({
    message: isProd
      ? 'Щось пішло не так. Будь ласка, спробуйте пізніше.'
      : err.message,
  });
};
