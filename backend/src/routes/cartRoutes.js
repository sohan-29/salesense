import express from 'express';
import { getCart, addCartItem, setCartItemQty, removeCartItem, clearCart, checkout } from '../controllers/cartController.js';
import authenticate from '../middleware/auth.js';
import requireRole from '../middleware/role.js';
import validate from '../middleware/validate.js';
import { cartItemSchema, cartQtySchema } from '../validators/schemas.js';

const router = express.Router();

// Cart is customer-only.
router.use(authenticate, requireRole('customer'));

router.get('/', getCart);
router.post('/', validate.body(cartItemSchema), addCartItem);
router.patch('/:productId', validate.body(cartQtySchema), setCartItemQty);
router.delete('/:productId', removeCartItem);
router.delete('/', clearCart);
router.post('/checkout', checkout);

export default router;
