import express from 'express';
import { revenueByVendor, productPerformance, summary, validate, chartAnalytics } from '../controllers/analyticsController.js';
import { revenueAnalysis, benchmark, revenueAnalysisCsv, benchmarkCsv, analyticsReport } from '../controllers/benchmarkController.js';
import authenticate from '../middleware/auth.js';
import requireRole from '../middleware/role.js';
import validateRequest from '../middleware/validate.js';
import { analyticsChartQuerySchema, analyticsBenchmarkQuerySchema } from '../validators/schemas.js';

const router = express.Router();

// Analytics are for vendors and admins only (customers don't see marketplace revenue).
router.use(authenticate, requireRole('vendor', 'admin'));

router.get('/revenue', revenueByVendor);
router.get('/products', productPerformance);
router.get('/summary', summary);
router.get('/chart', validateRequest.query(analyticsChartQuerySchema), chartAnalytics);
router.get('/revenue-analysis', validateRequest.query(analyticsBenchmarkQuerySchema), revenueAnalysis);
router.get('/revenue-analysis/export', validateRequest.query(analyticsBenchmarkQuerySchema), revenueAnalysisCsv);
router.get('/benchmark', validateRequest.query(analyticsBenchmarkQuerySchema), benchmark);
router.get('/benchmark/export', validateRequest.query(analyticsBenchmarkQuerySchema), benchmarkCsv);
router.get('/report', validateRequest.query(analyticsBenchmarkQuerySchema), analyticsReport);
router.get('/validate', validate);

export default router;
