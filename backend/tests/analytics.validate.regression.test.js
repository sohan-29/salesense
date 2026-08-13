import { connectTestDb, makeCustomer, backdate } from './setup.js';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import Vendor from '../src/models/Vendor.js';
import Product from '../src/models/Product.js';
import Transaction from '../src/models/Transaction.js';

const DAY = 24 * 60 * 60 * 1000;

let app;
let adminToken;

/**
 * Regression guard for the /api/analytics/validate backtest endpoint, using a
 * single hermetic dataset seeded up-front so the assertions hold regardless of
 * which other test files run in the same jest invocation (the in-memory
 * repl-set is shared across files; connectTestDb drops the DB once before this
 * file's beforeAll, then everything below is seeded here).
 *
 * Scenario:
 *   - Frequent customers (F1, F2) with steady 2-units/day demand over 20 days
 *     → clean train/test split → non-degenerate metrics.
 *   - One CANCELLED transaction that must NEVER leak into the metrics (the
 *     backtest excludes cancelled rows from both train and test).
 *
 * Assertions are on shape + bounds + field presence and on the fact that
 * cancelled rows do not shift the totals, which is order-independent.
 * (The exact threshold assertions on a carefully-shaped dataset live in
 * validation.test.js.)
 */
let vendor;
let products;

beforeAll(async () => {
  await connectTestDb();
  app = createApp();

  const admin = new Vendor({ businessName: 'Admin', contactEmail: 'admin@valreg.test', role: 'admin', status: 'Active' });
  await admin.setPassword('adminpass');
  await admin.save();
  adminToken = (await request(app).post('/api/auth/admin/login').send({ email: 'admin@valreg.test', password: 'adminpass' })).body.token;

  vendor = new Vendor({ businessName: 'ValReg Vendor', contactEmail: 'v@valreg.test', role: 'vendor', status: 'Active' });
  await vendor.setPassword('p');
  await vendor.save();

  products = await Product.create([
    { vendorId: vendor._id, name: 'Healthy A', category: 'Electronics', price: 10 },
    { vendorId: vendor._id, name: 'Healthy B', category: 'Electronics', price: 10 },
  ]);

  const customers = await Promise.all([
    makeCustomer({ name: 'VR F1', email: 'f1@valreg.test', password: 'secret123' }),
    makeCustomer({ name: 'VR F2', email: 'f2@valreg.test', password: 'secret123' }),
  ]);

  const now = Date.now();
  const docs = [];
  // Steady demand: 2 units/day per frequent customer for the trailing 20 days.
  for (let d = 20; d >= 1; d--) {
    const date = new Date(now - d * DAY);
    docs.push({ productId: products[0]._id, vendorId: vendor._id, customerId: customers[0]._id, quantity: 2, unitPrice: 10, totalAmount: 20, status: 'paid', date });
    docs.push({ productId: products[1]._id, vendorId: vendor._id, customerId: customers[1]._id, quantity: 2, unitPrice: 10, totalAmount: 20, status: 'paid', date });
  }
  // A cancelled transaction that must be excluded from the backtest.
  docs.push({ productId: products[0]._id, vendorId: vendor._id, customerId: customers[0]._id, quantity: 50, unitPrice: 10, totalAmount: 500, status: 'cancelled', date: new Date(now - 2 * DAY) });
  await Transaction.create(docs);
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe('GET /api/analytics/validate — regression guards', () => {
  it('returns a 200 with the full metric + thresholds shape', async () => {
    const res = await request(app).get('/api/analytics/validate').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    for (const k of ['forecastAccuracy', 'segmentationQuality', 'recommendationRelevance']) {
      expect(res.body).toHaveProperty(k);
    }
    expect(res.body.thresholds).toEqual({
      forecastAccuracy: 0.8,
      segmentationQuality: 0.85,
      recommendationRelevance: 0.75,
    });
    expect(res.body).toHaveProperty('details');
  });

  it('every metric is a bounded number in [0, 1] (never NaN / >1)', async () => {
    const res = await request(app).get('/api/analytics/validate').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    for (const k of ['forecastAccuracy', 'segmentationQuality', 'recommendationRelevance']) {
      expect(typeof res.body[k]).toBe('number');
      expect(Number.isNaN(res.body[k])).toBe(false);
      expect(res.body[k]).toBeGreaterThanOrEqual(0);
      expect(res.body[k]).toBeLessThanOrEqual(1);
    }
  });

  it('excludes cancelled transactions from the backtest (details.transactions counts only live rows)', async () => {
    const res = await request(app).get('/api/analytics/validate').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    // We seeded 40 live rows (2 customers × 20 days) + 1 cancelled.
    // details.transactions must reflect the 40 live rows, NOT the 41 including cancelled.
    expect(res.body.details.transactions).toBe(40);
  });

  it('populates the details fields the dashboards rely on', async () => {
    const res = await request(app).get('/api/analytics/validate').set('Authorization', `Bearer ${adminToken}`);
    const d = res.body.details;
    expect(d.transactions).toBeGreaterThan(0);
    expect(d.forecastProducts).toBeGreaterThan(0);
    expect(d.segmentationCustomers).toBeGreaterThan(0);
    expect(d.splitDate).toBeTruthy();
    expect(d.testWindowDays).toBeGreaterThan(0);
    expect(d).toHaveProperty('recommendationCandidates');
    expect(d).toHaveProperty('recommendationEvaluated');
    expect(d).toHaveProperty('recommendationHits');
  });

  it('the steady-demand forecast exceeds a formal minimum accuracy', async () => {
    const res = await request(app).get('/api/analytics/validate').set('Authorization', `Bearer ${adminToken}`);
    // Steady 2/day demand with a moving-average predictor on a 70/30 split
    // yields near-perfect forecast accuracy; require a conservative floor.
    expect(res.body.forecastAccuracy).toBeGreaterThan(0.5);
  });

  it('requires vendor/admin auth (a customer gets 403)', async () => {
    await makeCustomer({ name: 'Unauth', email: 'unauth@valreg.test', password: 'secret123' });
    const customerToken = (await request(app).post('/api/auth/customer/login').send({ email: 'unauth@valreg.test', password: 'secret123' })).body.token;
    const res = await request(app).get('/api/analytics/validate').set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(403);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app).get('/api/analytics/validate');
    expect(res.status).toBe(401);
  });
});
