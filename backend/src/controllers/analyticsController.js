import Transaction from '../models/Transaction.js';
import Product from '../models/Product.js';
import Vendor from '../models/Vendor.js';
import Customer from '../models/Customer.js';
import asyncHandler from '../utils/asyncHandler.js';
import { runValidation } from '../utils/validation.js';

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
