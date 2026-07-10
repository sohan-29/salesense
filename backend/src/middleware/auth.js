import Vendor from '../models/Vendor.js';
import { verifyToken } from '../utils/jwt.js';
import ApiError from '../utils/ApiError.js';

/**
 * Authenticate the request from the `Authorization: Bearer <token>` header.
 * Attaches the loaded vendor document to `req.vendor`.
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

    const vendor = await Vendor.findById(payload.sub);
    if (!vendor) throw ApiError.unauthorized('Account not found');
    if (vendor.status === 'Suspended') throw ApiError.forbidden('Account suspended');

    req.vendor = vendor;
    next();
  } catch (err) {
    next(err);
  }
};

export default authenticate;
