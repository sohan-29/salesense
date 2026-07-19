import express from 'express';
import { listInventory, restock, lowStock, forecastInventory } from '../controllers/inventoryController.js';
import authenticate from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import { restockSchema, lowStockQuerySchema, forecastQuerySchema } from '../validators/schemas.js';

const router = express.Router();

router.use(authenticate);

// NOTE: parameterless paths must be declared before /:productId to avoid shadowing.
router.get('/low-stock', validate.query(lowStockQuerySchema), lowStock);
router.get('/forecast', validate.query(forecastQuerySchema), forecastInventory);
router.get('/', listInventory);
router.patch('/:productId', validate.body(restockSchema), restock);

export default router;
