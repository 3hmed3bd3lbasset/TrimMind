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
import { ipJailGuard, honeypotRouter } from './middleware/honeypot.js';
import { verifyLedgerIntegrity } from './services/financialLedger.service.js';
import { requireAuth, requireRoles, defaultDenyAuthMiddleware } from './middleware/auth.js';

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
import waitlistRoutes from './routes/waitlist.routes.js';
import recallRoutes from './routes/recall.routes.js';
import insightsRoutes from './routes/insights.routes.js';
import { initWhatsApp, getWhatsAppState, getDebugLogs } from './services/whatsapp.service.js';
import { initNoShowProtectionCron } from './services/noshow.service.js';
import { getUploadDir, getPersistentDb, savePersistentDb } from './services/persistentStorage.service.js';

import { AppContainer } from './container.js';
export const container = new AppContainer();

dotenv.config();

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// ============================================================================
// 1. Ultra-Fast Zero-Trust IP Jail Pre-Flight (Fast-Drop Blacklisted Bots in 0.05ms)
// ============================================================================
app.use(ipJailGuard);

// ============================================================================
// 2. Core Military-Grade Security Middlewares
// ============================================================================
app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(cookieParser());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(sanitizeMiddleware);

// ============================================================================
// 3. Honeypot Traps for Automated Bot Reconnaissance & Blacklisting
// ============================================================================
app.use(honeypotRouter);

// ============================================================================
// 4. Global Distributed Rate Limiter
// ============================================================================
app.use('/api', apiLimiter);

// ============================================================================
// 5. Global Default-Deny Authorization Guard (All endpoints denied unless whitelisted)
// ============================================================================
app.use('/api', defaultDenyAuthMiddleware);

// ============================================================================
// 6. Static Uploads Serving (Protected against Directory Traversal)
// ============================================================================
const uploadsPath = getUploadDir();
app.use('/uploads/whatsapp_auth', (_req, res) => {
  res.status(403).json({ success: false, error: 'Forbidden' });
});
app.use('/uploads', express.static(uploadsPath));

// ============================================================================
// 7. Application API Routes
// ============================================================================
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
app.use('/api/waitlist', waitlistRoutes);
app.use('/api/recall', recallRoutes);
app.use('/api/insights', insightsRoutes);

// Tamper-Evident Financial Ledger Integrity Check (Manager Only)
app.get('/api/financial/verify-ledger', requireAuth, requireRoles('manager'), async (req, res) => {
  try {
    const branchId = req.query.branchId as string | undefined;
    const report = await verifyLedgerIntegrity(branchId);
    return res.json({ success: true, data: report });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Persistent Sync & Bootstrap Endpoints
app.get('/api/sync/bootstrap', (_req, res) => {
  const db = getPersistentDb();
  res.json({ success: true, data: db });
});

app.post('/api/sync/backup', (req, res) => {
  try {
    const payload = req.body;
    if (payload && typeof payload === 'object') {
      savePersistentDb(payload);
      return res.json({ success: true, message: 'Persistent backup saved successfully' });
    }
    return res.status(400).json({ success: false, error: 'Invalid payload' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Elite Salon Cloud Backend',
    version: '1.0.0',
  });
});

app.get('/api/debug-logs', (_req, res) => {
  res.json({
    status: 'healthy',
    whatsapp: getWhatsAppState(),
    logs: getDebugLogs(),
  });
});

// 7. Serve React Frontend SPA build on the exact same port (Unified Host for Railway)
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

// 8. Global Secure Error Handler
app.use(errorHandler);

// 9. Initialize Realtime WebSockets & Cron Tasks
initSocketIO(server, CLIENT_URL);
initCleanupCron();
initNoShowProtectionCron();

import { initReminderService } from './services/reminder.service.js';
import { ensureInitialDbData } from './services/cleanup.service.js';

// Start Server
async function startServer() {
  await testDbConnection();
  await ensureInitialDbData();

  server.listen(PORT, () => {
    console.log('====================================================');
    console.log(`💈 ELITE SALON PRODUCTION BACKEND SERVER IS RUNNING`);
    console.log(`📡 URL: http://localhost:${PORT}`);
    console.log(`🔒 Security: Zero-Trust IP Jail, MagicBytes, HashLedger, Helmet, CORS, RateLimiting Active`);
    console.log(`⚡ Realtime: WebSockets Socket.io Ready`);
    console.log(`📱 Initializing WhatsApp Integration Engine...`);
    console.log('====================================================');
    initWhatsApp();
    initReminderService();
  });
}

startServer();
