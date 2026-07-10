import ApiError from '../utils/ApiError.js';

/**
 * Require the authenticated account to have one of the given roles.
 * Works across all account kinds (vendor | admin | customer): a customer
 * has `req.customer` instead of `req.vendor`.
 *
 *  - not authenticated at all -> 401
 *  - authenticated but role not allowed -> 403
 *
 * Usage: requireRole('admin')  or  requireRole('vendor', 'admin')
 */
const requireRole = (...roles) => (req, _res, next) => {
  const role = req.vendor?.role || req.customer?.role || req.role;
  const authenticated = !!req.vendor || !!req.customer;
  if (!authenticated) return next(ApiError.unauthorized('Authentication required'));
  if (!roles.includes(role)) {
    return next(ApiError.forbidden('Insufficient permissions'));
  }
  next();
};

export const requireAdmin = requireRole('admin');
export default requireRole;
