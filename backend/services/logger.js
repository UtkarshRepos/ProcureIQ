// services/logger.js
// Centralized logging using Winston
// All AI calls, errors, and requests are logged here

const { createLogger, format, transports } = require('winston');
const path = require('path');

const { combine, timestamp, printf, colorize, errors } = format;

// Custom log format
const logFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  let log = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
  if (Object.keys(meta).length > 0) log += ` | ${JSON.stringify(meta)}`;
  if (stack) log += `\n${stack}`;
  return log;
});

const logger = createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    logFormat
  ),
  transports: [
    // Console output (colorized in dev)
    new transports.Console({
      format: combine(colorize(), timestamp({ format: 'HH:mm:ss' }), logFormat)
    }),
    // File: all logs
    new transports.File({
      filename: path.join(__dirname, '../logs/combined.log'),
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 5
    }),
    // File: errors only
    new transports.File({
      filename: path.join(__dirname, '../logs/error.log'),
      level: 'error',
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5
    })
  ]
});

module.exports = logger;
