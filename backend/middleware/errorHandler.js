// middleware/errorHandler.js
// Centralized error handling — clean JSON errors always returned

const logger = require('../services/logger');

module.exports = (err, req, res, next) => {
  const requestId = req.requestId || 'N/A';
  logger.error('Unhandled error', {
    requestId,
    error: err.message,
    status: err.status,
    retryAfterMs: err.retryAfterMs,
    path: req.path,
    stack: err.stack
  });

  // Multer errors (file upload)
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ success: false, error: 'File too large. Max 10MB allowed.' });
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ success: false, error: 'Unexpected file field.' });
  }

  // Generic errors
  const status = err.status || 500;
  const payload = {
    success: false,
    error: err.message || 'Internal server error',
    requestId
  };

  if (status === 429 && err.retryAfterMs) {
    payload.retryAfterMs = err.retryAfterMs;
  }

  res.status(status).json(payload);
};
