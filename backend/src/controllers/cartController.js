import mongoose from 'mongoose';
import Cart from '../models/Cart.js';
import Product from '../models/Product.js';
import Inventory from '../models/Inventory.js';
import Transaction from '../models/Transaction.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

/**
 * Shopping cart controller. One persistent cart per customer.
 *
 * Checkout is the hard part: it converts ALL cart items into Transaction rows
 * in a single MongoDB transaction. If ANY item fails (missing product /
 * insufficient stock), the whole checkout aborts and NO stock is decremented
 * and NO order is created — no partial orders. Reuses the proven
 * session.withTransaction pattern from transactionController.
 */

async function getOrCreateCart(customerId) {
  const cart = await Cart.findOne({ customerId });
  if (cart) return cart;
  return Cart.create({ customerId, items: [] });
}

/** Populate cart items with product info for the response. */
async function populatedCart(customerId) {
  const cart = await getOrCreateCart(customerId);
  await cart.populate('items.productId', 'name category price images status vendorId');
  return cart;
}

/** GET /api/cart — the customer's cart with product details. */
export const getCart = asyncHandler(async (req, res) => {
  const cart = await populatedCart(req.customer._id);
  res.json({ cart });
});

/** POST /api/cart — add an item (merge quantity if already present). */
export const addCartItem = asyncHandler(async (req, res) => {
  const { productId, quantity } = req.body;
  const cart = await getOrCreateCart(req.customer._id);

  // Validate product exists + capture available stock for the cap.
  const product = await Product.findById(productId);
  if (!product) throw ApiError.notFound('Product not found');
  const inventory = await Inventory.findOne({ productId });
  const available = inventory?.stockAvailable ?? 0;
  if (available < 1) throw ApiError.badRequest('Product is out of stock');

  const existing = cart.items.find((i) => i.productId.toString() === productId.toString());
  if (existing) {
    existing.quantity = Math.min(existing.quantity + quantity, available);
  } else {
    cart.items.push({ productId, quantity: Math.min(quantity, available) });
  }
  await cart.save();
  const updated = await populatedCart(req.customer._id);
  res.json({ cart: updated });
});

/** PATCH /api/cart/:productId — set quantity (0 removes the item). */
export const setCartItemQty = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const { quantity } = req.body;
  const cart = await getOrCreateCart(req.customer._id);

  if (quantity <= 0) {
    cart.items = cart.items.filter((i) => i.productId.toString() !== productId);
  } else {
    const item = cart.items.find((i) => i.productId.toString() === productId);
    if (!item) throw ApiError.notFound('Item not in cart');
    const inventory = await Inventory.findOne({ productId });
    const available = inventory?.stockAvailable ?? 0;
    item.quantity = Math.min(quantity, available);
  }
  await cart.save();
  const updated = await populatedCart(req.customer._id);
  res.json({ cart: updated });
});

/** DELETE /api/cart/:productId — remove an item. */
export const removeCartItem = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const cart = await getOrCreateCart(req.customer._id);
  cart.items = cart.items.filter((i) => i.productId.toString() !== productId);
  await cart.save();
  const updated = await populatedCart(req.customer._id);
  res.json({ cart: updated });
});

/** DELETE /api/cart — clear the cart. */
export const clearCart = asyncHandler(async (req, res) => {
  const cart = await getOrCreateCart(req.customer._id);
  cart.items = [];
  await cart.save();
  res.json({ cart });
});

/**
 * POST /api/cart/checkout — convert the cart into ONE atomic multi-item order.
 *
 * Each cart item becomes a Transaction row; stock is decremented per item.
 * If any item fails (missing product / insufficient stock), the transaction
 * aborts and NOTHING is written — no partial orders, no stock leakage.
 */
export const checkout = asyncHandler(async (req, res) => {
  const cart = await getOrCreateCart(req.customer._id);
  if (!cart.items.length) throw ApiError.badRequest('Cart is empty');

  const session = await mongoose.startSession();
  try {
    let created;
    await session.withTransaction(async () => {
      // Validate + reserve every item inside the transaction.
      for (const item of cart.items) {
        const product = await Product.findById(item.productId).session(session);
        if (!product) throw ApiError.notFound(`Product not found: ${item.productId}`);
        if (product.status !== 'active') throw ApiError.badRequest(`Product no longer available: ${product.name}`);

        const inventory = await Inventory.findOne({ productId: product._id }).session(session);
        if (!inventory) throw ApiError.notFound(`Inventory record not found for ${product.name}`);
        if (inventory.stockAvailable < item.quantity) {
          throw ApiError.badRequest(
            `Insufficient stock for ${product.name}: requested ${item.quantity}, available ${inventory.stockAvailable}`
          );
        }
        inventory.stockAvailable -= item.quantity;
        inventory.lastUpdated = new Date();
        await inventory.save({ session });

        await Transaction.create(
          [
            {
              productId: product._id,
              vendorId: product.vendorId,
              customerId: req.customer._id,
              quantity: item.quantity,
              unitPrice: product.price,
              totalAmount: product.price * item.quantity,
              status: 'paid',
            },
          ],
          { session }
        );
      }

      // All items succeeded → clear the cart.
      cart.items = [];
      await cart.save({ session });
      created = true;
    });

    // Re-fetch the created transactions for the response (newest first).
    const latest = await Transaction.find({ customerId: req.customer._id })
      .sort('-date')
      .limit(cart.items.length || 50)
      .populate('productId', 'name category price');
    res.status(201).json({ checkedOut: true, transactions: latest });
  } finally {
    session.endSession();
  }
});
