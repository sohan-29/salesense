import express from 'express';
import { vendorRegister, vendorLogin, adminRegister, adminLogin, me } from '../controllers/authController.js';
import { customerRegister, customerLogin } from '../controllers/customerAuthController.js';
import authenticate from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import {
  customerRegisterSchema,
  customerLoginSchema,
  vendorRegisterSchema,
  vendorLoginSchema,
  adminLoginSchema,
  adminRegisterSchema,
} from '../validators/schemas.js';

const router = express.Router();

// --- customer ---
router.post('/customer/register', validate.body(customerRegisterSchema), customerRegister);
router.post('/customer/login', validate.body(customerLoginSchema), customerLogin);

// --- vendor ---
router.post('/vendor/register', validate.body(vendorRegisterSchema), vendorRegister);
router.post('/vendor/login', validate.body(vendorLoginSchema), vendorLogin);

// --- admin ---
router.post('/admin/register', validate.body(adminRegisterSchema), adminRegister);
router.post('/admin/login', validate.body(adminLoginSchema), adminLogin);

// --- any authenticated account ---
router.get('/me', authenticate, me);

export default router;
