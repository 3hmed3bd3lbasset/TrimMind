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
    // Allow requests without origin (same-origin, static files, mobile apps, server-to-server)
    if (!origin) {
      return callback(null, true);
    }

    const isAllowed =
      allowedOrigins.includes(origin) ||
      origin.endsWith('.railway.app') ||
      origin.endsWith('.up.railway.app') ||
      origin.includes('localhost') ||
      origin.includes('127.0.0.1');

    if (isAllowed) {
      return callback(null, true);
    }

    return callback(new Error(`CORS Error: Origin ${origin} is not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'x-agent-secret',
    'x-api-key',
    'x-hub-signature-256',
    'x-signature-256',
    'x-webhook-signature',
    'x-webhook-timestamp',
    'x-webhook-nonce',
  ],
});

// Military-Grade Helmet & Content Security Policy (Anti-Clickjacking, Anti-XSS, Anti-MIME Sniffing)
export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "blob:"],
      workerSrc: ["'self'", "blob:"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'https://images.unsplash.com', 'blob:', 'https://*.railway.app', 'https://*.up.railway.app'],
      connectSrc: [
        "'self'",
        clientUrl,
        'ws:',
        'wss:',
        'https://generativelanguage.googleapis.com',
        'https://*.googleapis.com',
        'https://*.railway.app',
        'https://*.up.railway.app',
      ],
      frameAncestors: ["'none'"], // Total Clickjacking Immunity
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  frameguard: { action: 'deny' }, // Anti-Clickjacking
  hidePoweredBy: true,
  hsts: isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
});
