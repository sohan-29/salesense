import ApiError from '../utils/ApiError.js';

/** 404 handler for unmatched routes. */
export default function notFound(req, _res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}
