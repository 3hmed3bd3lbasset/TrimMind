import rateLimit from 'express-rate-limit';

// Standard API Rate Limiter
export const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 120, // max 120 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: {
    success: false,
    error: 'تم تجاوز الحد المسموح من الطلبات، يرجى الانتظار دقيقة والمحاولة مرة أخرى.',
  },
});

// Strict Login / Auth Limiter (Anti-Brute Force)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Max 10 login attempts per 15 min per IP
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: {
    success: false,
    error: 'تم تجميد محاولات الدخول مؤقتاً لحماية الحساب (10 محاولات غير صحيحة). يرجى المحاولة بعد 15 دقيقة.',
  },
});

// Booking Creation Limiter (Anti-Spam)
export const bookingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 15, // Max 15 bookings per hour per IP
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: {
    success: false,
    error: 'لقد قمت بإنشاء عدد كبير من الحجوزات مؤخراً. يرجى الانتظار قليلاً.',
  },
});

// File Upload Limiter
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Max 20 uploads per hour per IP
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: {
    success: false,
    error: 'تم تجاوز الحد المسموح لرفع الملفات والصور. يرجى المحاولة لاحقاً.',
  },
});

// AI Chat Limiter (Anti-Spam & Cost Protection)
export const aiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // Max 30 AI queries per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: {
    success: false,
    error: 'تم تجاوز الحد المسموح من استفسارات المساعد الذكي. يرجى الانتظار دقيقة والمحاولة مجدداً.',
  },
});
