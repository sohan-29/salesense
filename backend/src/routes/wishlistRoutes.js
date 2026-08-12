import express from 'express';
import { getWishlist, addWishlistItem, removeWishlistItem, moveToCart } from '../controllers/wishlistController.js';
import authenticate from '../middleware/auth.js';
import requireRole from '../middleware/role.js';

const router = express.Router();

// Wishlist is customer-only.
router.use(authenticate, requireRole('customer'));

router.get('/', getWishlist);
router.post('/:productId', addWishlistItem);
router.delete('/:productId', removeWishlistItem);
router.post('/:productId/move-to-cart', moveToCart);

export default router;
