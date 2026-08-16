import { Request, Response, NextFunction } from 'express';

const isProd = process.env.NODE_ENV === 'production';

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  // Log full error safely to server console/logs
  console.error('🔴 Server Error:', {
    message: err.message,
    stack: isProd ? undefined : err.stack,
    timestamp: new Date().toISOString(),
  });

  const statusCode = typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;

  // Mask internal details for security in response
  const userMessage = err.isOperational
    ? err.message
    : 'حدث خطأ غير متوقع في معالجة طلبك، يرجى المحاولة لاحقاً';

  res.status(statusCode).json({
    success: false,
    error: userMessage,
    ...(isProd ? {} : { debug: err.message }),
  });
}
