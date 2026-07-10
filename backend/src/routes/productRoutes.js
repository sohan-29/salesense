import express from 'express';
import {
  createProduct,
  listProducts,
  getProduct,
  updateProduct,
  deleteProduct,
} from '../controllers/productController.js';
import authenticate from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import { productCreateSchema, productUpdateSchema } from '../validators/schemas.js';

const router = express.Router();

router.use(authenticate);

router.post('/', validate.body(productCreateSchema), createProduct);
router.get('/', listProducts);
router.get('/:id', getProduct);
router.put('/:id', validate.body(productUpdateSchema), updateProduct);
router.delete('/:id', deleteProduct);

export default router;
