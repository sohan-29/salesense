import mongoose from 'mongoose';
import Customer from '../models/Customer.js';
import Transaction from '../models/Transaction.js';
import Product from '../models/Product.js';
import MLCustomerSegment from '../models/MLCustomerSegment.js';
import { customerMetrics, bucketCustomer, SEGMENTS, DAY_MS } from '../utils/segmentation.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

// ML segment cache freshness: a cached row is served only if younger than
// this AND the customer has not purchased since it was generated; otherwise
// the RFM rules fallback computes it live. Segments drift slower than
// recommendations, so the default window is a day, not an hour.
const ML_SEGMENT_MAX_AGE_MIN = Number(process.env.ML_SEGMENT_MAX_AGE_MIN || 1440);

/**
 * Read fresh K-Means segment rows (batch write-back from the Python segmenter,
 * `python -m recommender.cli segment-refresh`). Returns a Map keyed by
 * customerId hex, or null when the cache is missing/stale — callers then fall
 * back to the in-process RFM rules. Same freshness logic shape as
 * recommendationController.readFreshMLCache.
 */
async function readFreshMLSegments(customerIds) {
  const since = new Date(Date.now() - ML_SEGMENT_MAX_AGE_MIN * 60 * 1000);
  const newerTxns = await Transaction.find({
    customerId: { $in: customerIds },
    status: { $ne: 'cancelled' },
    date: { $gte: since },
  })
    .select('customerId date')
    .lean();
  const staleAfter = new Map(); // customerId -> generatedAt that must be beaten
  for (const t of newerTxns) {
    const key = t.customerId.toString();
    // Stale if the customer bought anything after the cache was generated.
    staleAfter.set(key, Math.max(staleAfter.get(key) || 0, t.date.getTime()));
  }

  const rows = await MLCustomerSegment.find({
    customerId: { $in: customerIds },
    model: 'kmeans',
    generatedAt: { $gte: since },
  }).lean();

  const fresh = new Map();
  for (const row of rows) {
    const key = row.customerId.toString();
    const cutoff = staleAfter.get(key) || 0;
    if (row.generatedAt.getTime() <= cutoff) continue; // purchased after generation
    fresh.set(key, row);
  }
  return fresh;
}

/** GET /api/customers — admin lists all customers (with spend/order summary + segment). */
export const listCustomers = asyncHandler(async (req, res) => {
  const customers = await Customer.find().sort('-createdAt').select('-__v');
  if (customers.length === 0) return res.json({ customers: [] });

  const now = new Date();
  const since30 = new Date(now.getTime() - 30 * DAY_MS);
  const ids = customers.map((c) => c._id);
  const metricsAll = await customerMetrics({ until: now, customerIds: ids });
  const metrics30 = await customerMetrics({ since: since30, until: now, customerIds: ids });
  const byId = new Map(metricsAll.map((m) => [m.customerId.toString(), m]));
  const byId30 = new Map(metrics30.map((m) => [m.customerId.toString(), m]));
  const mlSegments = await readFreshMLSegments(ids);

  const enriched = customers.map((c) => {
    const m = byId.get(c._id.toString());
    const m30 = byId30.get(c._id.toString());
    const joinedDaysAgo = Math.floor((now.getTime() - c.createdAt.getTime()) / DAY_MS);
    const ml = mlSegments.get(c._id.toString());
    const segment = ml
      ? ml.segment
      : bucketCustomer({
          recencyDays: m ? m.recencyDays : null,
          ordersLast30d: m30 ? m30.orderCount : 0,
          joinedDaysAgo,
        });
    return {
      ...c.toObject(),
      segment,
      segmentSource: ml ? 'kmeans' : 'rules-fallback',
      cluster: ml ? ml.cluster : undefined,
      orderCount: m ? m.orderCount : 0,
      totalSpend: m ? m.totalSpend : 0,
      lastPurchaseDate: m ? m.lastPurchaseDate : null,
    };
  });

  res.json({ customers: enriched });
});

/**
 * GET /api/customers/segments — segment all customers.
 *
 * Primary source: the K-Means model (trained by the Python segmenter on
 * RFM features — spend, order count, average order value, recency — with k
 * chosen by silhouette; labels Premium / Regular / New / Inactive assigned
 * from cluster centroids). Served freshness-gated from the `ml_segments`
 * cache. Fallback: the deterministic RFM rules in utils/segmentation.js
 * (frequent / occasional / atRisk / dormant / new) when the cache is missing
 * or stale, so the endpoint always answers.
 */
export const segmentCustomers = asyncHandler(async (req, res) => {
  const customers = await Customer.find().select('name email createdAt');
  if (customers.length === 0) {
    return res.json({ segments: {}, summary: { total: 0, counts: {} }, source: 'none' });
  }

  const ids = customers.map((c) => c._id);
  const now = new Date();
  const mlSegments = await readFreshMLSegments(ids);

  if (mlSegments.size > 0) {
    // K-Means path: group by the ML segment label; keep behaviour metrics
    // alongside so the admin table still shows spend/orders per customer.
    const metricsAll = await customerMetrics({ until: now, customerIds: ids });
    const byId = new Map(metricsAll.map((m) => [m.customerId.toString(), m]));

    const segments = {};
    const counts = {};
    let k = null;
    let silhouette = null;
    for (const c of customers) {
      const ml = mlSegments.get(c._id.toString());
      if (!ml) continue; // no fresh ML row → excluded from the ML view
      k = ml.k;
      silhouette = ml.silhouette;
      const m = byId.get(c._id.toString());
      const joinedDaysAgo = Math.floor((now.getTime() - c.createdAt.getTime()) / DAY_MS);
      segments[ml.segment] = segments[ml.segment] || [];
      segments[ml.segment].push({
        _id: c._id,
        name: c.name,
        email: c.email,
        joinedDaysAgo,
        cluster: ml.cluster,
        orderCount: m ? m.orderCount : 0,
        totalSpend: m ? m.totalSpend : 0,
        lastPurchaseDate: m ? m.lastPurchaseDate : null,
        features: ml.features,
      });
      counts[ml.segment] = (counts[ml.segment] || 0) + 1;
    }

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return res.json({
      segments,
      summary: { total, counts },
      source: 'kmeans',
      model: { k, silhouette, labels: Object.keys(segments) },
    });
  }

  // Fallback path: deterministic RFM rules (frequent / dormant / new /
  // atRisk / occasional) computed live from transaction history.
  const since30 = new Date(now.getTime() - 30 * DAY_MS);
  const metricsAll = await customerMetrics({ until: now, customerIds: ids });
  const metrics30 = await customerMetrics({ since: since30, until: now, customerIds: ids });
  const byId = new Map(metricsAll.map((m) => [m.customerId.toString(), m]));
  const byId30 = new Map(metrics30.map((m) => [m.customerId.toString(), m]));

  const segments = Object.fromEntries(SEGMENTS.map((s) => [s, []]));
  for (const c of customers) {
    const m = byId.get(c._id.toString());
    const m30 = byId30.get(c._id.toString());
    const joinedDaysAgo = Math.floor((now.getTime() - c.createdAt.getTime()) / DAY_MS);
    const segment = bucketCustomer({
      recencyDays: m ? m.recencyDays : null,
      ordersLast30d: m30 ? m30.orderCount : 0,
      joinedDaysAgo,
    });
    segments[segment].push({
      _id: c._id,
      name: c.name,
      email: c.email,
      joinedDaysAgo,
      orderCount: m ? m.orderCount : 0,
      totalSpend: m ? m.totalSpend : 0,
      lastPurchaseDate: m ? m.lastPurchaseDate : null,
    });
  }

  const counts = Object.fromEntries(SEGMENTS.map((s) => [s, segments[s].length]));
  res.json({ segments, summary: { total: customers.length, counts }, source: 'rules-fallback' });
});

/**
 * GET /api/customers/:id/behaviour — per-customer purchase history and metrics
 * (joined with product name/category), totals, and favourite category.
 */
export const customerBehaviour = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw ApiError.badRequest('Invalid customer id');
  const customer = await Customer.findById(req.params.id).select('-__v');
  if (!customer) throw ApiError.notFound('Customer not found');

  const txns = await Transaction.find({ customerId: customer._id, status: { $ne: 'cancelled' } })
    .sort('-date')
    .populate('productId', 'name category price')
    .limit(100);

  const now = new Date();
  let totalSpend = 0;
  let totalUnits = 0;
  const catSpend = {};
  const history = txns.map((t) => {
    totalSpend += t.totalAmount;
    totalUnits += t.quantity;
    const cat = t.productId?.category || 'Uncategorised';
    catSpend[cat] = (catSpend[cat] || 0) + t.totalAmount;
    return {
      _id: t._id,
      date: t.date,
      product: t.productId ? { name: t.productId.name, category: t.productId.category, price: t.productId.price } : null,
      quantity: t.quantity,
      totalAmount: t.totalAmount,
      status: t.status,
    };
  });

  const favouriteCategory =
    Object.entries(catSpend).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const lastPurchaseDate = txns.length ? txns[0].date : null;
  const recencyDays = lastPurchaseDate
    ? Math.floor((now.getTime() - lastPurchaseDate.getTime()) / DAY_MS)
    : null;

  res.json({
    customer,
    behaviour: {
      orderCount: txns.length,
      totalSpend,
      totalUnits,
      favouriteCategory,
      lastPurchaseDate,
      recencyDays,
      history,
    },
  });
});
