import helmet from 'helmet';
import cors from 'cors';
import { RequestHandler } from 'express';

const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
const isProd = process.env.NODE_ENV === 'production';

// Allowed origins
const allowedOrigins = [
  clientUrl,
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5000',
  'http://127.0.0.1:5173',
];

export const corsMiddleware: RequestHandler = cors({
  origin: (origin, callback) => {
    // Allow server-to-server or requests without origin (e.g. mobile apps / curl in dev)
    if (!origin || allowedOrigins.includes(origin) || !isProd) {
      callback(null, true);
    } else {
      callback(new Error('Blocked by CORS security policy'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
});

export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'https://images.unsplash.com', 'blob:'],
      connectSrc: [
        "'self'",
        clientUrl,
        'ws:',
        'wss:',
        'https://generativelanguage.googleapis.com',
        'https://*.googleapis.com',
      ],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  frameguard: { action: 'sameorigin' },
  hidePoweredBy: true,
  hsts: isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  noSniff: true,
  xssFilter: true,
});
