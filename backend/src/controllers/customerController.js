import mongoose from 'mongoose';
import Customer from '../models/Customer.js';
import Transaction from '../models/Transaction.js';
import Product from '../models/Product.js';
import { customerMetrics, bucketCustomer, SEGMENTS, DAY_MS } from '../utils/segmentation.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

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

  const enriched = customers.map((c) => {
    const m = byId.get(c._id.toString());
    const m30 = byId30.get(c._id.toString());
    const joinedDaysAgo = Math.floor((now.getTime() - c.createdAt.getTime()) / DAY_MS);
    const segment = bucketCustomer({
      recencyDays: m ? m.recencyDays : null,
      ordersLast30d: m30 ? m30.orderCount : 0,
      joinedDaysAgo,
    });
    return {
      ...c.toObject(),
      segment,
      orderCount: m ? m.orderCount : 0,
      totalSpend: m ? m.totalSpend : 0,
      lastPurchaseDate: m ? m.lastPurchaseDate : null,
    };
  });

  res.json({ customers: enriched });
});

/**
 * GET /api/customers/segments — segment all customers (frequent / dormant /
 * new / atRisk / occasional) from their transaction history.
 */
export const segmentCustomers = asyncHandler(async (req, res) => {
  const customers = await Customer.find().select('name email createdAt');
  if (customers.length === 0) {
    return res.json({ segments: Object.fromEntries(SEGMENTS.map((s) => [s, []])), summary: { total: 0, counts: {} } });
  }

  const now = new Date();
  const since30 = new Date(now.getTime() - 30 * DAY_MS);
  const metricsAll = await customerMetrics({ until: now, customerIds: customers.map((c) => c._id) });
  const metrics30 = await customerMetrics({ since: since30, until: now, customerIds: customers.map((c) => c._id) });
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
  res.json({ segments, summary: { total: customers.length, counts } });
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
