import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { testDbConnection } from './config/database.js';
import { corsMiddleware, helmetMiddleware } from './config/security.js';
import { sanitizeMiddleware } from './middleware/sanitize.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';
import { initSocketIO } from './socket/realtime.js';
import { initCleanupCron } from './services/cleanup.service.js';

// Route handlers
import authRoutes from './routes/auth.routes.js';
import bookingsRoutes from './routes/bookings.routes.js';
import queueRoutes from './routes/queue.routes.js';
import branchesRoutes from './routes/branches.routes.js';
import barbersRoutes from './routes/barbers.routes.js';
import chairsRoutes from './routes/chairs.routes.js';
import servicesRoutes from './routes/services.routes.js';
import productsRoutes from './routes/products.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import auditRoutes from './routes/audit.routes.js';
import aiRoutes from './routes/ai.routes.js';
import agentToolsRoutes from './routes/agentTools.routes.js';
import whatsappSessionRoutes from './routes/whatsappSession.routes.js';
import { initWhatsApp } from './services/whatsapp.service.js';

dotenv.config();

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';

// 1. Core Security Middlewares
app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(cookieParser());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(sanitizeMiddleware);

// 2. Global Rate Limiter
app.use('/api', apiLimiter);

// 3. Static Uploads Serving
const uploadsPath = path.resolve(UPLOAD_DIR);
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}
app.use('/uploads', express.static(uploadsPath));

// 4. API Routes
app.use('/api/auth', authRoutes);
app.use('/api/bookings', bookingsRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/branches', branchesRoutes);
app.use('/api/barbers', barbersRoutes);
app.use('/api/chairs', chairsRoutes);
app.use('/api/services', servicesRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/agent-tools', agentToolsRoutes);
app.use('/api/whatsapp', agentToolsRoutes);
app.use('/api/whatsapp-session', whatsappSessionRoutes);

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Elite Salon Cloud Backend',
    version: '1.0.0',
  });
});

// 5. Serve React Frontend SPA build on the exact same port (Unified Host for Railway)
const candidateDistPaths = [
  path.resolve(__dirname, '../../dist'),
  path.resolve(process.cwd(), '../dist'),
  path.resolve(process.cwd(), 'dist'),
  path.resolve(__dirname, '../dist'),
];
const clientDistPath = candidateDistPaths.find((p) => fs.existsSync(path.join(p, 'index.html'))) || candidateDistPaths[0];

if (fs.existsSync(path.join(clientDistPath, 'index.html'))) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      return next();
    }
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
  console.log(`📦 Serving React Frontend directly from ${clientDistPath}`);
}

// 6. Global Secure Error Handler
app.use(errorHandler);

// 6. Initialize Realtime WebSockets & Cron Tasks
initSocketIO(server, CLIENT_URL);
initCleanupCron();

// Start Server
async function startServer() {
  await testDbConnection();

  server.listen(PORT, () => {
    console.log('====================================================');
    console.log(`💈 ELITE SALON PRODUCTION BACKEND SERVER IS RUNNING`);
    console.log(`📡 URL: http://localhost:${PORT}`);
    console.log(`🔒 Security: Helmet, CORS, RateLimiting, Bcrypt, JWT Active`);
    console.log(`⚡ Realtime: WebSockets Socket.io Ready`);
    console.log(`📱 Initializing WhatsApp Integration Engine...`);
    console.log('====================================================');
    initWhatsApp();
  });
}

startServer();
