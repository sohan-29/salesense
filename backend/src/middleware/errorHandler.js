import env from '../config/env.js';

/**
 * Final error handler. Normalises ApiError, Mongoose duplicate-key and
 * validation errors, and Zod errors into a consistent JSON shape.
 */
// eslint-disable-next-line no-unused-vars
export default function errorHandler(err, _req, res, _next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let details = err.details;

  // Mongoose duplicate key
  if (err.code === 11000) {
    statusCode = 409;
    message = 'A record with that value already exists';
    details = { key: err.keyValue };
  }
  // Mongoose validation
  else if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation failed';
    details = err.errors;
  }
  // Cast error (bad ObjectId etc.)
  else if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid ${err.path}: ${err.value}`;
  }

  const body = {
    error: { message, ...(details ? { details } : {}) },
  };

  if (env.nodeEnv !== 'production' && statusCode >= 500) {
    // eslint-disable-next-line no-console
    console.error(err);
    body.error.stack = err.stack;
  }

  res.status(statusCode).json(body);
}
