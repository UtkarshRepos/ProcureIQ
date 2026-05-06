// server.js
// ProcureAI Backend — Main Express Server
// All AI calls are secured here — API key never leaves this server
// Frontend served directly at http://localhost:3001

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const logger = require('./services/logger');
const requestLogger = require('./middleware/requestLogger');
const errorHandler = require('./middleware/errorHandler');

// ── Routes ────────────────────────────────────────────────────
const analyzeRoutes = require('./routes/analyze');
const compareRoutes = require('./routes/compare');
const hrRoutes = require('./routes/hr');
const chatRoutes = require('./routes/chat');
const webhookRoutes = require('./routes/webhook');

const app = express();
const PORT = process.env.PORT || 3001;

// ── Ensure logs directory exists ──────────────────────────────
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);

// ── Security Middleware ───────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false  // Disabled so frontend HTML loads correctly
}));

// CORS — allow same origin (frontend served by this server)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

// Rate limiting — prevent API abuse
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: { success: false, error: 'Too many requests — please wait a few minutes' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/', limiter);

// ── Request Logging ───────────────────────────────────────────
app.use(requestLogger);

// ── Serve Frontend ────────────────────────────────────────────
// Just run: npm run dev
// Then open: http://localhost:3001
const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// ── Health Check ──────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'ProcureAI Backend',
    company: process.env.COMPANY_NAME || 'Delta Controls FZCO',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    geminiConfigured: !!process.env.GEMINI_API_KEY,
    frontendUrl: `http://localhost:${PORT}`
  });
});

// ── API Routes ────────────────────────────────────────────────
app.use('/api', analyzeRoutes);
app.use('/api', compareRoutes);
app.use('/api', hrRoutes);
app.use('/api', chatRoutes);
app.use('/api', webhookRoutes);

// ── 404 Handler ───────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.path}`,
    availableRoutes: [
      'GET  /              → Frontend UI',
      'GET  /health',
      'POST /api/analyze-document',
      'POST /api/analyze-text',
      'POST /api/compare-quotes',
      'POST /api/screen-cv',
      'POST /api/chat',
      'POST /api/webhook/email-document',
      'GET  /api/webhook/health'
    ]
  });
});

// ── Error Handler ─────────────────────────────────────────────
app.use(errorHandler);

// ── Start Server ──────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info('═══════════════════════════════════════');
  logger.info('  ProcureAI Backend Started');
  logger.info(`  Port     : ${PORT}`);
  logger.info(`  Env      : ${process.env.NODE_ENV || 'development'}`);
  logger.info(`  Company  : ${process.env.COMPANY_NAME || 'Delta Controls FZCO'}`);
  logger.info(`  Gemini   : ${process.env.GEMINI_API_KEY ? '✓ Configured' : '✗ MISSING — set GEMINI_API_KEY in .env'}`);
  logger.info(`  Open     : http://localhost:${PORT}`);
  logger.info('═══════════════════════════════════════');
});

module.exports = app;