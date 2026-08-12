import Wishlist from '../models/Wishlist.js';
import Cart from '../models/Cart.js';
import Product from '../models/Product.js';
import Inventory from '../models/Inventory.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

/**
 * Wishlist controller. One persistent wishlist per customer; items are a set
 * of product refs (no quantity). Move-to-cart delegates to the cart API.
 */

async function getOrCreateWishlist(customerId) {
  const wishlist = await Wishlist.findOne({ customerId });
  if (wishlist) return wishlist;
  return Wishlist.create({ customerId, items: [] });
}

async function populatedWishlist(customerId) {
  const wishlist = await getOrCreateWishlist(customerId);
  await wishlist.populate('items.productId', 'name category price images status vendorId');
  return wishlist;
}

/** GET /api/wishlist — the customer's wishlist with product details. */
export const getWishlist = asyncHandler(async (req, res) => {
  const wishlist = await populatedWishlist(req.customer._id);
  res.json({ wishlist });
});

/** POST /api/wishlist/:productId — add to wishlist (idempotent). */
export const addWishlistItem = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const wishlist = await getOrCreateWishlist(req.customer._id);
  const exists = wishlist.items.some((i) => i.productId.toString() === productId);
  if (!exists) {
    wishlist.items.push({ productId });
    await wishlist.save();
  }
  const updated = await populatedWishlist(req.customer._id);
  res.json({ wishlist: updated });
});

/** DELETE /api/wishlist/:productId — remove from wishlist. */
export const removeWishlistItem = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const wishlist = await getOrCreateWishlist(req.customer._id);
  wishlist.items = wishlist.items.filter((i) => i.productId.toString() !== productId);
  await wishlist.save();
  const updated = await populatedWishlist(req.customer._id);
  res.json({ wishlist: updated });
});

/**
 * POST /api/wishlist/:productId/move-to-cart — convenience: add to cart (qty 1)
 * then remove from wishlist. One round-trip for the UI.
 */
export const moveToCart = asyncHandler(async (req, res) => {
  const { productId } = req.params;

  const product = await Product.findById(productId);
  if (!product) throw ApiError.notFound('Product not found');
  const inventory = await Inventory.findOne({ productId });
  if ((inventory?.stockAvailable ?? 0) < 1) throw ApiError.badRequest('Product is out of stock');

  // Get or create the cart inline (Cart model handles its own scoping).
  let cart = await Cart.findOne({ customerId: req.customer._id });
  if (!cart) cart = await Cart.create({ customerId: req.customer._id, items: [] });
  const existing = cart.items.find((i) => i.productId.toString() === productId);
  if (existing) {
    existing.quantity = Math.min(existing.quantity + 1, inventory.stockAvailable);
  } else {
    cart.items.push({ productId, quantity: 1 });
  }
  await cart.save();

  const wishlist = await getOrCreateWishlist(req.customer._id);
  wishlist.items = wishlist.items.filter((i) => i.productId.toString() !== productId);
  await wishlist.save();

  const [cartPop, wishPop] = await Promise.all([
    cart.populate('items.productId', 'name category price images status vendorId'),
    wishlist.populate('items.productId', 'name category price images status vendorId'),
  ]);
  res.json({ cart: cartPop, wishlist: wishPop });
});
