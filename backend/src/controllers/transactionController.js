import mongoose from 'mongoose';
import Product from '../models/Product.js';
import Inventory from '../models/Inventory.js';
import Transaction from '../models/Transaction.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

/**
 * POST /api/transactions — record an order.
 *
 * Atomic: in a single Mongoose transaction we (1) load the product + its
 * inventory, (2) check sufficient stock, (3) decrement stockAvailable, and
 * (4) write the Transaction row with totalAmount = quantity * unitPrice.
 * All four steps succeed or none do — revenue can never diverge from the
 * recorded inventory movement (the "≥98% transactional consistency" target).
 *
 * Requires a replica set (MongoDB Atlas provides this by default).
 */
export const createTransaction = asyncHandler(async (req, res) => {
  const { productId, quantity } = req.body;

  const session = await mongoose.startSession();
  try {
    let created;
    await session.withTransaction(async () => {
      const product = await Product.findById(productId).session(session);
      if (!product) throw ApiError.notFound('Product not found');

      const inventory = await Inventory.findOne({ productId }).session(session);
      if (!inventory) throw ApiError.notFound('Inventory record not found for product');

      if (inventory.stockAvailable < quantity) {
        throw ApiError.badRequest(
          `Insufficient stock: requested ${quantity}, available ${inventory.stockAvailable}`
        );
      }

      inventory.stockAvailable -= quantity;
      inventory.lastUpdated = new Date();
      await inventory.save({ session });

      const unitPrice = product.price;
      const totalAmount = unitPrice * quantity;
      const [tx] = await Transaction.create(
        [
          {
            productId: product._id,
            vendorId: product.vendorId,
            quantity,
            unitPrice,
            totalAmount,
            status: 'paid',
          },
        ],
        { session }
      );
      created = tx;
    });

    res.status(201).json({ transaction: created });
  } finally {
    session.endSession();
  }
});

/** GET /api/transactions — vendor sees own; admin sees all. Optional ?productId filter. */
export const listTransactions = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.vendor.role !== 'admin') filter.vendorId = req.vendor._id;
  if (req.query.productId) filter.productId = req.query.productId;

  const transactions = await Transaction.find(filter)
    .sort('-date')
    .populate('productId', 'name category price')
    .limit(200);
  res.json({ transactions });
});
