import express from 'express';
import {
  createProduct,
  listProducts,
  getProduct,
  updateProduct,
  deleteProduct,
} from '../controllers/productController.js';
import authenticate from '../middleware/auth.js';
import requireRole from '../middleware/role.js';
import validate from '../middleware/validate.js';
import { productCreateSchema, productUpdateSchema } from '../validators/schemas.js';

const router = express.Router();

router.use(authenticate);

// Anyone authenticated may browse; only vendors create products.
router.get('/', listProducts);
router.get('/:id', getProduct);
router.post('/', requireRole('vendor'), validate.body(productCreateSchema), createProduct);
router.put('/:id', requireRole('vendor', 'admin'), validate.body(productUpdateSchema), updateProduct);
router.delete('/:id', requireRole('vendor', 'admin'), deleteProduct);

export default router;
