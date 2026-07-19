import express from 'express';
import { listCustomers, segmentCustomers, customerBehaviour } from '../controllers/customerController.js';
import authenticate from '../middleware/auth.js';
import { requireAdmin } from '../middleware/role.js';

const router = express.Router();

// Admin marketplace management — customer behaviour analytics.
router.use(authenticate, requireAdmin);

router.get('/', listCustomers);
router.get('/segments', segmentCustomers);
router.get('/:id/behaviour', customerBehaviour);

export default router;
