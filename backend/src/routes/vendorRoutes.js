import express from 'express';
import {
  listVendors,
  getVendor,
  getMe,
  updateMe,
  changePassword,
  submitVerification,
  updateStatus,
} from '../controllers/vendorController.js';
import authenticate from '../middleware/auth.js';
import { requireAdmin } from '../middleware/role.js';
import validate from '../middleware/validate.js';
import {
  updateProfileSchema,
  changePasswordSchema,
  submitVerificationSchema,
  vendorStatusSchema,
} from '../validators/schemas.js';

const router = express.Router();

// --- own profile (any authenticated vendor) ---
router.get('/me', authenticate, getMe);
router.put('/me', authenticate, validate.body(updateProfileSchema), updateMe);
router.put('/me/password', authenticate, validate.body(changePasswordSchema), changePassword);
router.post('/me/verification', authenticate, validate.body(submitVerificationSchema), submitVerification);

// --- admin marketplace management ---
router.get('/', authenticate, requireAdmin, listVendors);
router.get('/:id', authenticate, requireAdmin, getVendor);
router.patch('/:id/status', authenticate, requireAdmin, validate.body(vendorStatusSchema), updateStatus);

export default router;
