import ApiError from '../utils/ApiError.js';

/**
 * Require the authenticated vendor to have one of the given roles.
 * Usage: requireRole('admin')  or  requireRole('admin', 'vendor')
 */
const requireRole = (...roles) => (req, _res, next) => {
  if (!req.vendor) return next(ApiError.unauthorized('Authentication required'));
  if (!roles.includes(req.vendor.role)) {
    return next(ApiError.forbidden('Insufficient permissions'));
  }
  next();
};

export const requireAdmin = requireRole('admin');
export default requireRole;
