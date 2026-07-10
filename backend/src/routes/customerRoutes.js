import express from 'express';
import { listCustomers } from '../controllers/customerController.js';
import authenticate from '../middleware/auth.js';
import { requireAdmin } from '../middleware/role.js';

const router = express.Router();

// Admin marketplace management — list all customers.
router.get('/', authenticate, requireAdmin, listCustomers);

export default router;
