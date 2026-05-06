// middleware/requestLogger.js
// Logs every incoming request with timing

const logger = require('../services/logger');
const { v4: uuidv4 } = require('uuid');

module.exports = (req, res, next) => {
  const requestId = uuidv4().split('-')[0]; // Short ID e.g. "a3f2b1c"
  req.requestId = requestId;

  const start = Date.now();
  logger.info(`→ ${req.method} ${req.path}`, {
    requestId,
    ip: req.ip,
    userAgent: req.get('user-agent')?.substring(0, 50)
  });

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 400 ? 'warn' : 'info';
    logger[level](`← ${req.method} ${req.path} ${res.statusCode}`, {
      requestId,
      duration: `${duration}ms`
    });
  });

  next();
};
