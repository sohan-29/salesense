import mongoose from 'mongoose';
import Transaction from '../models/Transaction.js';
import Product from '../models/Product.js';
import Vendor from '../models/Vendor.js';
import Customer from '../models/Customer.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import { runValidation } from '../utils/validation.js';
import { computeRevenueAnalysis, computeBenchmark } from './benchmarkController.js';

/**
 * GET /api/analytics/revenue — revenue grouped by vendor (Step 4 baseline report).
 * Admin sees all vendors; a vendor sees only their own slice.
 */
export const revenueByVendor = asyncHandler(async (req, res) => {
  const match = {};
  if (req.vendor.role !== 'admin') match.vendorId = req.vendor._id;

  const report = await Transaction.aggregate([
    { $match: { ...match, status: { $ne: 'cancelled' } } },
    {
      $group: {
        _id: '$vendorId',
        totalRevenue: { $sum: '$totalAmount' },
        totalUnitsSold: { $sum: '$quantity' },
        orderCount: { $sum: 1 },
      },
    },
    { $sort: { totalRevenue: -1 } },
    {
      $lookup: {
        from: 'vendors',
        localField: '_id',
        foreignField: '_id',
        as: 'vendor',
      },
    },
    { $unwind: { path: '$vendor', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        vendorId: '$_id',
        businessName: '$vendor.businessName',
        status: '$vendor.status',
        totalRevenue: 1,
        totalUnitsSold: 1,
        orderCount: 1,
      },
    },
  ]);

  res.json({ report });
});

/** GET /api/analytics/products — product performance (revenue + units), top first. */
export const productPerformance = asyncHandler(async (req, res) => {
  const match = {};
  if (req.vendor.role !== 'admin') match.vendorId = req.vendor._id;

  const report = await Transaction.aggregate([
    { $match: { ...match, status: { $ne: 'cancelled' } } },
    {
      $group: {
        _id: '$productId',
        revenue: { $sum: '$totalAmount' },
        unitsSold: { $sum: '$quantity' },
      },
    },
    { $sort: { revenue: -1 } },
    {
      $lookup: {
        from: 'products',
        localField: '_id',
        foreignField: '_id',
        as: 'product',
      },
    },
    { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        productId: '$_id',
        name: '$product.name',
        category: '$product.category',
        price: '$product.price',
        revenue: 1,
        unitsSold: 1,
      },
    },
  ]);

  res.json({ report });
});

/** GET /api/analytics/summary — top-level KPIs for the dashboard. */
export const summary = asyncHandler(async (req, res) => {
  const isAdmin = req.vendor.role === 'admin';
  const match = isAdmin ? {} : { vendorId: req.vendor._id };

  const [agg] = await Transaction.aggregate([
    { $match: { ...match, status: { $ne: 'cancelled' } } },
    {
      $group: {
        _id: null,
        gmv: { $sum: '$totalAmount' },
        totalUnits: { $sum: '$quantity' },
        orderCount: { $sum: 1 },
      },
    },
  ]);

  const gmv = agg?.gmv || 0;
  const totalUnits = agg?.totalUnits || 0;
  const orderCount = agg?.orderCount || 0;
  const aov = orderCount ? gmv / orderCount : 0;

  const vendorCount = await Vendor.countDocuments(isAdmin ? {} : { _id: req.vendor._id });
  const activeVendors = await Vendor.countDocuments(
    isAdmin ? { status: 'Active' } : { _id: req.vendor._id, status: 'Active' }
  );
  const productCount = await Product.countDocuments(
    isAdmin ? {} : { vendorId: req.vendor._id }
  );
  const customerCount = isAdmin ? await Customer.countDocuments({}) : 0;

  res.json({
    summary: {
      gmv,
      totalUnits,
      orderCount,
      aov: Number(aov.toFixed(2)),
      vendorCount,
      activeVendors,
      productCount,
      customerCount,
    },
  });
});

/**
 * GET /api/analytics/executive — consolidated executive-BI summary.
 *
 * A single call that aggregates everything the new `/executive` dashboard needs:
 * top-level KPIs, revenue trend + growth, top vendors by GMV, top products by
 * revenue, fulfilment rate, and marketplace benchmark averages. One request
 * instead of five, so the page renders as a single coherent executive view.
 * Reuses the M3 compute helpers so the numbers always agree with the
 * /revenue-analysis and /benchmark endpoints. Admin-only.
 */
export const executive = asyncHandler(async (req, res) => {
  if (req.vendor.role !== 'admin') throw ApiError.forbidden('Executive analytics is admin-only');

  const [summaryRow, analysis, benchmark] = await Promise.all([
    (async () => {
      const [agg] = await Transaction.aggregate([
        { $match: { status: { $ne: 'cancelled' } } },
        {
          $group: {
            _id: null,
            gmv: { $sum: '$totalAmount' },
            totalUnits: { $sum: '$quantity' },
            orderCount: { $sum: 1 },
            delivered: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
          },
        },
      ]);
      const gmv = agg?.gmv || 0;
      const orderCount = agg?.orderCount || 0;
      const deliveredOrders = agg?.delivered || 0;
      const aov = orderCount ? gmv / orderCount : 0;
      return {
        gmv: Number(gmv.toFixed(2)),
        totalUnits: agg?.totalUnits || 0,
        orderCount,
        aov: Number(aov.toFixed(2)),
        deliveredOrders,
        fulfilmentRate: orderCount ? Number((deliveredOrders / orderCount).toFixed(3)) : 0,
      };
    })(),
    computeRevenueAnalysis(req),
    computeBenchmark(req),
  ]);

  const [vendorCount, activeVendors, productCount, customerCount] = await Promise.all([
    Vendor.countDocuments({}),
    Vendor.countDocuments({ status: 'Active' }),
    Product.countDocuments({}),
    Customer.countDocuments({}),
  ]);

  // Top 5 vendors by GMV from the revenue-analysis breakdown (already sorted).
  const topVendors = analysis.byVendor.slice(0, 5).map((v) => ({
    vendorId: v.vendorId,
    businessName: v.businessName,
    gmv: v.gmv,
    netRevenue: v.netRevenue,
    commission: v.commission,
    marginPct: v.marginPct,
    orders: v.orders,
  }));

  // Top 5 products by revenue — reuse the product-performance aggregation.
  const productsAgg = await Transaction.aggregate([
    { $match: { status: { $ne: 'cancelled' }, ...(req.query.vendorId ? { vendorId: new mongoose.Types.ObjectId(req.query.vendorId) } : {}) } },
    {
      $group: {
        _id: '$productId',
        revenue: { $sum: '$totalAmount' },
        unitsSold: { $sum: '$quantity' },
      },
    },
    { $sort: { revenue: -1 } },
    { $limit: 5 },
    { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
    { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        productId: '$_id',
        name: '$product.name',
        category: '$product.category',
        revenue: 1,
        unitsSold: 1,
      },
    },
  ]);

  res.json({
    summary: summaryRow,
    growth: analysis.growth,
    totals: analysis.totals,
    trend: analysis.timeseries,
    topVendors,
    topProducts: productsAgg,
    marketplace: {
      vendorCount,
      activeVendors,
      productCount,
      customerCount,
    },
    benchmark: benchmark.benchmark,
    generatedAt: new Date().toISOString(),
    filters: req.query,
  });
});

/**
 * GET /api/analytics/validate — backtest the three Milestone-2 analytical
 * outputs (forecast / segmentation / recommendations) against held-out
 * historical transactions. Reports actual metric vs the concept-note
 * thresholds (0.80 / 0.85 / 0.75).
 */
export const validate = asyncHandler(async (req, res) => {
  const result = await runValidation({
    trainRatio: 0.7,
    windowDays: Number(req.query.windowDays) || 7,
    horizon: Number(req.query.horizon) || 7,
  });
  res.json(result);
});

/**
 * Price-band buckets for the price-distribution chart. Fixed bands so the
 * chart axis is stable regardless of the filtered dataset.
 */
const PRICE_BANDS = [
  { label: '0–100', min: 0, max: 100 },
  { label: '100–500', min: 100, max: 500 },
  { label: '500–1k', min: 500, max: 1000 },
  { label: '1k–5k', min: 1000, max: 5000 },
  { label: '5k+', min: 5000, max: Number.MAX_SAFE_INTEGER },
];

function priceBandFor(amount) {
  const band = PRICE_BANDS.find((b) => amount >= b.min && amount < b.max);
  return band ? band.label : '5k+';
}

/**
 * GET /api/analytics/chart — filterable graphical-analytics payload.
 *
 * Query params (all optional): from, to (ISO), minPrice, maxPrice, category,
 * vendorId (admin only), status. Vendors are always scoped to their own
 * vendorId; admins may optionally filter to one vendor.
 *
 * Returns: summary KPIs + timeseries (daily) + byCategory + byStatus +
 * priceBuckets + topProducts, and byVendor (admin only).
 */
export const chartAnalytics = asyncHandler(async (req, res) => {
  const isAdmin = req.vendor.role === 'admin';

  // --- Build the base match from filters ---
  const match = { status: { $ne: 'cancelled' } };
  // Status filter overrides the default non-cancelled exclusion when set.
  if (req.query.status) {
    match.status = req.query.status;
  } else {
    match.status = { $ne: 'cancelled' };
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

  // --- Fetch filtered transactions with product joined (for category) ---
  let pipeline = [{ $match: match }];
  pipeline.push({
    $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' },
  });
  pipeline.push({ $unwind: { path: '$product', preserveNullAndEmptyArrays: true } });

  // Category filter applies to the joined product.
  if (req.query.category) {
    pipeline.push({ $match: { 'product.category': req.query.category } });
  }

  const rows = await Transaction.aggregate(pipeline);

  // --- Aggregate in JS from the filtered, joined set (small enough) ---
  let gmv = 0;
  let totalUnits = 0;
  let orderCount = 0;
  const tsMap = new Map();
  const catMap = new Map();
  const statusMap = new Map();
  const priceMap = new Map(PRICE_BANDS.map((b) => [b.label, { bucket: b.label, count: 0, revenue: 0 }]));
  const prodMap = new Map();

  for (const r of rows) {
    gmv += r.totalAmount || 0;
    totalUnits += r.quantity || 0;
    orderCount += 1;

    const day = new Date(r.date).toISOString().slice(0, 10);
    const ts = tsMap.get(day) || { date: day, revenue: 0, units: 0, orders: 0 };
    ts.revenue += r.totalAmount || 0;
    ts.units += r.quantity || 0;
    ts.orders += 1;
    tsMap.set(day, ts);

    const cat = r.product?.category || 'Uncategorised';
    const c = catMap.get(cat) || { category: cat, revenue: 0, units: 0 };
    c.revenue += r.totalAmount || 0;
    c.units += r.quantity || 0;
    catMap.set(cat, c);

    const st = r.status || 'unknown';
    const s = statusMap.get(st) || { status: st, count: 0, revenue: 0 };
    s.count += 1;
    s.revenue += r.totalAmount || 0;
    statusMap.set(st, s);

    const band = priceBandFor(r.totalAmount || 0);
    const pb = priceMap.get(band);
    if (pb) {
      pb.count += 1;
      pb.revenue += r.totalAmount || 0;
    }

    const pid = r.productId?.toString();
    if (pid) {
      const p = prodMap.get(pid) || {
        productId: pid,
        name: r.product?.name || '—',
        category: cat,
        revenue: 0,
        unitsSold: 0,
      };
      p.revenue += r.totalAmount || 0;
      p.unitsSold += r.quantity || 0;
      prodMap.set(pid, p);
    }
  }

  const aov = orderCount ? gmv / orderCount : 0;
  const timeseries = [...tsMap.values()].sort((a, b) => a.date.localeCompare(b.date));
  const byCategory = [...catMap.values()].sort((a, b) => b.revenue - a.revenue);
  const byStatus = [...statusMap.values()].sort((a, b) => b.count - a.count);
  const priceBuckets = PRICE_BANDS.map((b) => priceMap.get(b.label));
  const topProducts = [...prodMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 8);

  const result = {
    summary: {
      gmv: Number(gmv.toFixed(2)),
      totalUnits,
      orderCount,
      aov: Number(aov.toFixed(2)),
    },
    timeseries,
    byCategory,
    byStatus,
    priceBuckets,
    topProducts,
  };

  // Admin-only vendor breakdown (respecting the same filters).
  if (isAdmin) {
    const vendorMap = new Map();
    for (const r of rows) {
      const vid = r.vendorId?.toString();
      if (!vid) continue;
      const v = vendorMap.get(vid) || { vendorId: vid, businessName: '', revenue: 0, units: 0 };
      v.revenue += r.totalAmount || 0;
      v.units += r.quantity || 0;
      vendorMap.set(vid, v);
    }
    const vendorIds = [...vendorMap.keys()];
    const vendors = vendorIds.length ? await Vendor.find({ _id: { $in: vendorIds } }).select('businessName') : [];
    const vName = new Map(vendors.map((v) => [v._id.toString(), v.businessName]));
    result.byVendor = [...vendorMap.values()]
      .map((v) => ({ ...v, businessName: vName.get(v.vendorId) || '—' }))
      .sort((a, b) => b.revenue - a.revenue);
  }

  res.json(result);
});
