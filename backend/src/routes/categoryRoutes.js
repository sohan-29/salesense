import express from 'express';
import { listCategories, createCategory } from '../controllers/categoryController.js';
import authenticate from '../middleware/auth.js';
import { requireAdmin } from '../middleware/role.js';

const router = express.Router();

router.get('/', authenticate, listCategories);
router.post('/', authenticate, requireAdmin, createCategory);

export default router;
