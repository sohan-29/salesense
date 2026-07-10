import Vendor from '../models/Vendor.js';
import Customer from '../models/Customer.js';
import { verifyToken } from '../utils/jwt.js';
import ApiError from '../utils/ApiError.js';

/**
 * Authenticate from the `Authorization: Bearer <token>` header. The token's
 * `role` claim selects the collection: 'customer' -> Customer, otherwise
 * Vendor (vendor | admin). Attaches `req.vendor` OR `req.customer`, plus
 * `req.role`.
 */
const authenticate = async (req, _res, next) => {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw ApiError.unauthorized('Authentication required');
    }

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      throw ApiError.unauthorized('Invalid or expired token');
    }

    if (payload.role === 'customer') {
      const customer = await Customer.findById(payload.sub);
      if (!customer) throw ApiError.unauthorized('Account not found');
      req.customer = customer;
      req.role = 'customer';
    } else {
      const vendor = await Vendor.findById(payload.sub);
      if (!vendor) throw ApiError.unauthorized('Account not found');
      if (vendor.status === 'Suspended') throw ApiError.forbidden('Account suspended');
      req.vendor = vendor;
      req.role = vendor.role; // 'vendor' | 'admin'
    }
    next();
  } catch (err) {
    next(err);
  }
};

export default authenticate;
