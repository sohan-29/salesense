import Inventory from '../models/Inventory.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

/** GET /api/inventory — vendor sees own; admin sees all. */
export const listInventory = asyncHandler(async (req, res) => {
  const filter = req.vendor.role === 'admin' ? {} : { vendorId: req.vendor._id };
  const items = await Inventory.find(filter)
    .populate('productId', 'name sku category')
    .sort('-updatedAt');
  res.json({ inventory: items });
});

/** PATCH /api/inventory/:productId — restock / adjust. */
export const restock = asyncHandler(async (req, res) => {
  const { stockAvailable, reorderThreshold } = req.body;

  const item = await Inventory.findOne({ productId: req.params.productId });
  if (!item) throw ApiError.notFound('Inventory not found');
  if (req.vendor.role !== 'admin' && !item.vendorId.equals(req.vendor._id)) {
    throw ApiError.forbidden('Not allowed');
  }

  item.stockAvailable = stockAvailable;
  if (reorderThreshold !== undefined) item.reorderThreshold = reorderThreshold;
  item.lastUpdated = new Date();
  await item.save();

  res.json({ inventory: item });
});

/** GET /api/inventory/low-stock — items at or below reorder threshold. */
export const lowStock = asyncHandler(async (req, res) => {
  const { threshold } = req.query;
  const filter = req.vendor.role === 'admin' ? {} : { vendorId: req.vendor._id };

  // Match products whose available stock is at/below their reorder threshold,
  // or the override threshold if provided.
  const matchThreshold = threshold !== undefined
    ? { $lte: threshold }
    : { $lte: '$reorderThreshold' };

  const items = await Inventory.aggregate([
    { $match: filter },
    {
      $addFields: {
        available: { $max: [0, { $subtract: ['$stockAvailable', '$reserved'] }] },
      },
    },
    { $match: { available: matchThreshold } },
    { $sort: { available: 1 } },
    {
      $lookup: {
        from: 'products',
        localField: 'productId',
        foreignField: '_id',
        as: 'product',
      },
    },
    { $unwind: '$product' },
  ]);

  res.json({ count: items.length, inventory: items });
});
