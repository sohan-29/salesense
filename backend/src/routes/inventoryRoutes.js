import express from 'express';
import { listInventory, restock, lowStock } from '../controllers/inventoryController.js';
import authenticate from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import { restockSchema, lowStockQuerySchema } from '../validators/schemas.js';

const router = express.Router();

router.use(authenticate);

// NOTE: /low-stock must be declared before /:productId to avoid route shadowing.
router.get('/low-stock', validate.query(lowStockQuerySchema), lowStock);
router.get('/', listInventory);
router.patch('/:productId', validate.body(restockSchema), restock);

export default router;
