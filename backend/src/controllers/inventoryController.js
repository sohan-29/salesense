import Inventory from '../models/Inventory.js';
import Product from '../models/Product.js';
import InventoryForecast from '../models/InventoryForecast.js';
import { dailySalesByProduct, forecastFromEntry, DAY_MS } from '../utils/forecast.js';
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

/**
 * GET /api/inventory/forecast?productId=&days=7&horizon=7
 *
 * Moving-average forecast of next-week stock demand from historical
 * transactions. Vendor sees only their own products; admin sees all.
 * - No productId: forecast every product the caller owns.
 * - Persists an InventoryForecast row per product and returns the forecasts
 *   joined with product + current stock so the UI can show predicted vs
 *   available.
 */
export const forecastInventory = asyncHandler(async (req, res) => {
  const days = Number(req.query.days) || 7;
  const horizon = Number(req.query.horizon) || 7;
  const productId = req.query.productId;

  const vendorFilter = req.vendor.role === 'admin' ? {} : { vendorId: req.vendor._id };
  const productFilter = { ...vendorFilter };
  if (productId) {
    productFilter._id = productId;
  } else if (req.vendor.role !== 'admin') {
    // Non-admin without a specific product forecasts their whole catalogue.
  }

  const products = await Product.find(productFilter).select('name category price vendorId');
  if (products.length === 0) {
    if (productId) throw ApiError.notFound('Product not found');
    return res.json({ forecasts: [] });
  }

  const now = new Date();
  const since = new Date(now.getTime() - days * DAY_MS);
  const salesMap = await dailySalesByProduct({
    productIds: products.map((p) => p._id),
    since,
    until: now,
    vendorId: req.vendor.role === 'admin' ? null : req.vendor._id,
  });

  // Current stock for join.
  const invRows = await Inventory.find({ productId: { $in: products.map((p) => p._id) } });
  const stockByProduct = new Map(invRows.map((i) => [i.productId.toString(), i]));

  const docs = [];
  const forecasts = products.map((p) => {
    const entry = salesMap.get(p._id.toString()) || null;
    const fc = forecastFromEntry(entry, { windowDays: days, horizon, now });
    docs.push({
      productId: p._id,
      vendorId: p.vendorId,
      ...fc,
    });
    const inv = stockByProduct.get(p._id.toString());
    return {
      productId: p._id,
      name: p.name,
      category: p.category,
      price: p.price,
      stockAvailable: inv ? inv.stockAvailable : 0,
      reorderThreshold: inv ? inv.reorderThreshold : 0,
      ...fc,
    };
  });

  // Persist forecasts (best-effort; validation endpoint recomputes on demand).
  if (docs.length) {
    await InventoryForecast.insertMany(docs, { ordered: false });
  }

  res.json({ forecasts });
});
