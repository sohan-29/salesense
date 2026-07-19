import Customer from '../models/Customer.js';
import Product from '../models/Product.js';
import Transaction from '../models/Transaction.js';
import { buildPurchaseGraph, collaborativeScore, contentScore } from '../utils/recommend.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * GET /api/recommendations?customerId=&limit=5
 *
 * Hybrid personalised recommendations:
 *  1. Collaborative filtering from co-purchasers (primary).
 *  2. Content-based top-up from favourite categories when CF signal is thin.
 * A customer calling without customerId gets their own recommendations.
 */
export const recommendProducts = asyncHandler(async (req, res) => {
  const limit = Number(req.query.limit) || 5;
  const customerId = req.query.customerId
    ? req.query.customerId
    : req.customer
    ? req.customer._id
    : null;

  if (!customerId) throw ApiError.badRequest('customerId is required (or sign in as a customer)');

  const customer = await Customer.findById(customerId).select('name email createdAt');
  if (!customer) throw ApiError.notFound('Customer not found');

  // Collaborative filtering on all history.
  const graph = await buildPurchaseGraph();
  const cf = collaborativeScore(customerId, graph);

  const owned = graph.get(customerId.toString()) || new Set();
  const ranked = [...cf];

  // Content-based top-up if CF is thin.
  if (ranked.length < limit) {
    const txns = await Transaction.find({ customerId: customer._id, status: { $ne: 'cancelled' } })
      .populate('productId', 'category')
      .select('productId totalAmount');
    const catSpend = {};
    for (const t of txns) {
      const cat = t.productId?.category || 'Uncategorised';
      catSpend[cat] = (catSpend[cat] || 0) + (t.totalAmount || 0);
    }
    const candidates = await Product.find({ status: 'active' }).select('name category price vendorId');
    const cb = contentScore(catSpend, [...owned], candidates);
    // Merge, avoiding duplicates already ranked.
    const seen = new Set(ranked.map((r) => r.productId));
    for (const r of cb) {
      if (seen.has(r.productId)) continue;
      ranked.push(r);
      seen.add(r.productId);
      if (ranked.length >= limit * 2) break;
    }
  }

  // If still empty (brand-new customer, no history, no favourites), defer to popular.
  if (ranked.length === 0) {
    return popularProducts(req, res);
  }

  const top = ranked.slice(0, limit);
  const ids = top.map((r) => r.productId);
  const products = await Product.find({ _id: { $in: ids }, status: 'active' })
    .populate('vendorId', 'businessName')
    .select('name category price images vendorId');
  const byId = new Map(products.map((p) => [p._id.toString(), p]));

  const recommendations = top
    .map((r) => {
      const product = byId.get(r.productId);
      if (!product) return null;
      return { product, score: r.score, reason: r.reason, category: r.category };
    })
    .filter(Boolean);

  res.json({ customerId: customer._id, recommendations });
});

/**
 * GET /api/recommendations/popular — cold-start fallback for new customers:
 * top-selling active products by units sold.
 */
export const popularProducts = asyncHandler(async (req, res) => {
  const limit = Number(req.query.limit) || 5;
  const rows = await Transaction.aggregate([
    { $match: { status: { $ne: 'cancelled' } } },
    { $group: { _id: '$productId', unitsSold: { $sum: '$quantity' } } },
    { $sort: { unitsSold: -1 } },
    { $limit: limit * 2 },
  ]);
  const ids = rows.map((r) => r._id);
  const products = await Product.find({ _id: { $in: ids }, status: 'active' })
    .populate('vendorId', 'businessName')
    .select('name category price images vendorId');
  const byId = new Map(products.map((p) => [p._id.toString(), p]));
  const recommendations = rows
    .map((r) => {
      const product = byId.get(r._id.toString());
      if (!product) return null;
      return { product, score: r.unitsSold, reason: 'popular' };
    })
    .filter(Boolean)
    .slice(0, limit);

  res.json({ recommendations });
});
