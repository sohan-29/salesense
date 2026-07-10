import express from 'express';
import { revenueByVendor, productPerformance, summary } from '../controllers/analyticsController.js';
import authenticate from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

router.get('/revenue', revenueByVendor);
router.get('/products', productPerformance);
router.get('/summary', summary);

export default router;
