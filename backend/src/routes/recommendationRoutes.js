import express from 'express';
import { recommendProducts, popularProducts } from '../controllers/recommendationController.js';
import authenticate from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import { recommendationQuerySchema } from '../validators/schemas.js';

const router = express.Router();

// Any authenticated account may fetch recommendations. A customer gets their
// own; an admin/vendor passes ?customerId= to preview another customer's.
router.use(authenticate);

router.get('/popular', validate.query(recommendationQuerySchema), popularProducts);
router.get('/', validate.query(recommendationQuerySchema), recommendProducts);

export default router;
