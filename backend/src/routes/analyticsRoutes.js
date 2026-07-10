import express from 'express';
import { revenueByVendor, productPerformance, summary } from '../controllers/analyticsController.js';
import authenticate from '../middleware/auth.js';
import requireRole from '../middleware/role.js';

const router = express.Router();

// Analytics are for vendors and admins only (customers don't see marketplace revenue).
router.use(authenticate, requireRole('vendor', 'admin'));

router.get('/revenue', revenueByVendor);
router.get('/products', productPerformance);
router.get('/summary', summary);

export default router;
