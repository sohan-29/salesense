import mongoose from 'mongoose';

/**
 * Shared filter builder for the M3 analytics endpoints
 * (revenue-analysis + benchmark). Mirrors the /chart endpoint's filtering so
 * all three stay consistent: date range, price range, category (via product
 * join), status, and role-scoped vendorId.
 *
 * Returns a Mongo match object ready for Transaction.aggregate, scoped to the
 * caller's role. `category` is returned separately because it must be applied
 * AFTER the product $lookup (category lives on Product, not Transaction).
 */
export function buildAnalyticsMatch(req, { includeCancelledDefault = false } = {}) {
  const isAdmin = req.vendor.role === 'admin';

  const match = {};
  if (req.query.status) {
    match.status = req.query.status;
  } else {
    // Default: exclude cancelled (same as every other analytics endpoint).
    match.status = includeCancelledDefault ? { $exists: true } : { $ne: 'cancelled' };
  }

  // Role scoping: a vendor only ever sees their own slice.
  const vendorFilter = isAdmin ? req.query.vendorId : req.vendor._id;
  if (vendorFilter) match.vendorId = new mongoose.Types.ObjectId(vendorFilter);

  if (req.query.from || req.query.to) {
    match.date = {};
    if (req.query.from) match.date.$gte = new Date(req.query.from);
    if (req.query.to) match.date.$lt = new Date(req.query.to);
  }
  if (req.query.minPrice != null || req.query.maxPrice != null) {
    match.totalAmount = {};
    if (req.query.minPrice != null) match.totalAmount.$gte = Number(req.query.minPrice);
    if (req.query.maxPrice != null) match.totalAmount.$lte = Number(req.query.maxPrice);
  }

  return match;
}

/**
 * Fetch filtered + product-joined transactions, applying the category filter
 * after the lookup. Returns the raw joined rows for in-JS aggregation.
 */
export async function fetchFilteredTransactions(Transaction, req) {
  const match = buildAnalyticsMatch(req);
  const pipeline = [{ $match: match }];
  pipeline.push({
    $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' },
  });
  pipeline.push({ $unwind: { path: '$product', preserveNullAndEmptyArrays: true } });
  if (req.query.category) {
    pipeline.push({ $match: { 'product.category': req.query.category } });
  }
  return Transaction.aggregate(pipeline);
}

/**
 * Growth percentage: (current - previous) / previous, null-guarded.
 * Returns null when previous is 0/undefined (renders as "—").
 */
export function growthPct(current, previous) {
  if (previous == null || previous === 0) return null;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}
