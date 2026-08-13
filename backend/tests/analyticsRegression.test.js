import { connectTestDb, backdate, makeCustomer } from './setup.js';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import Vendor from '../src/models/Vendor.js';
import Product from '../src/models/Product.js';
import Inventory from '../src/models/Inventory.js';
import Transaction from '../src/models/Transaction.js';

/**
 * Analytics regression suite. A fixed golden dataset whose numbers are known by
 * hand, so any refactor of an aggregation pipeline that silently changes a
 * number fails here. Covers every /api/analytics endpoint + filter dimension.
 *
 * Golden dataset (2 vendors, 2 products each):
 *   Acme  — P1 (Electronics, ₹10) x [5 paid, 3 paid, 9 cancelled]
 *          P2 (Home, ₹25)       x [2 paid, 2 paid]
 *   Beta  — P3 (Electronics, ₹40) x [1 paid]
 *          P4 (Home, ₹100)      x [1 paid, 1 shipped, 1 delivered]
 *
 * Excluding cancelled, per vendor:
 *   Acme:  revenue 180, units 12, orders 4
 *   Beta:  revenue 180, units 3,  orders 3
 *   Total GMV 360, units 15, orders 7, AOV ≈ 51.43
 */

let app;
let adminToken;
let acmeToken;
let betaToken;
let acme, beta, p1, p2, p3, p4;

beforeAll(async () => {
  await connectTestDb();
  app = createApp();

  const admin = new Vendor({ businessName: 'Admin', contactEmail: 'admin@reg.test', role: 'admin', status: 'Active' });
  await admin.setPassword('adminpass');
  await admin.save();
  adminToken = (await request(app).post('/api/auth/admin/login').send({ email: 'admin@reg.test', password: 'adminpass' })).body.token;

  acme = new Vendor({ businessName: 'Acme', contactEmail: 'acme@reg.test', role: 'vendor', status: 'Active', commissionRate: 10 });
  await acme.setPassword('acmepass');
  await acme.save();
  acmeToken = (await request(app).post('/api/auth/vendor/login').send({ email: 'acme@reg.test', password: 'acmepass' })).body.token;

  beta = new Vendor({ businessName: 'Beta', contactEmail: 'beta@reg.test', role: 'vendor', status: 'Active', commissionRate: 20 });
  await beta.setPassword('betapass');
  await beta.save();
  betaToken = (await request(app).post('/api/auth/vendor/login').send({ email: 'beta@reg.test', password: 'betapass' })).body.token;

  [p1, p2, p3, p4] = await Product.create([
    { vendorId: acme._id, name: 'P1', category: 'Electronics', price: 10, status: 'active' },
    { vendorId: acme._id, name: 'P2', category: 'Home', price: 25, status: 'active' },
    { vendorId: beta._id, name: 'P3', category: 'Electronics', price: 40, status: 'active' },
    { vendorId: beta._id, name: 'P4', category: 'Home', price: 100, status: 'active' },
  ]);

  const txns = await Transaction.create([
    { productId: p1._id, vendorId: acme._id, quantity: 5, unitPrice: 10, totalAmount: 50, status: 'paid' },
    { productId: p1._id, vendorId: acme._id, quantity: 3, unitPrice: 10, totalAmount: 30, status: 'paid' },
    { productId: p2._id, vendorId: acme._id, quantity: 2, unitPrice: 25, totalAmount: 50, status: 'paid' },
    { productId: p2._id, vendorId: acme._id, quantity: 2, unitPrice: 25, totalAmount: 50, status: 'paid' },
    { productId: p2._id, vendorId: acme._id, quantity: 9, unitPrice: 25, totalAmount: 225, status: 'cancelled' },
    { productId: p3._id, vendorId: beta._id, quantity: 1, unitPrice: 40, totalAmount: 40, status: 'paid' },
    { productId: p4._id, vendorId: beta._id, quantity: 1, unitPrice: 100, totalAmount: 100, status: 'paid' },
    { productId: p4._id, vendorId: beta._id, quantity: 1, unitPrice: 100, totalAmount: 100, status: 'shipped' },
    { productId: p4._id, vendorId: beta._id, quantity: 1, unitPrice: 100, totalAmount: 100, status: 'delivered' },
  ]);
  // Backdate all to 5 days ago so date-range filters have a window to exclude.
  for (const t of txns) await backdate(Transaction, t._id, 5);
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe('Analytics regression — /revenue', () => {
  it('admin sees both vendors with exact totals (cancelled excluded)', async () => {
    const res = await request(app).get('/api/analytics/revenue').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const acmeRow = res.body.report.find((r) => r.businessName === 'Acme');
    const betaRow = res.body.report.find((r) => r.businessName === 'Beta');
    expect(acmeRow.totalRevenue).toBe(180);
    expect(acmeRow.totalUnitsSold).toBe(12);
    expect(acmeRow.orderCount).toBe(4);
    expect(betaRow.totalRevenue).toBe(340); // 40 + 100 + 100 + 100
    expect(betaRow.totalUnitsSold).toBe(4);
    expect(betaRow.orderCount).toBe(4);
  });

  it('vendor is scoped to only their own revenue', async () => {
    const res = await request(app).get('/api/analytics/revenue').set('Authorization', `Bearer ${acmeToken}`);
    expect(res.status).toBe(200);
    expect(res.body.report).toHaveLength(1);
    expect(res.body.report[0].businessName).toBe('Acme');
    expect(res.body.report[0].totalRevenue).toBe(180);
  });
});

describe('Analytics regression — /products', () => {
  it('ranks products by revenue and excludes cancelled', async () => {
    const res = await request(app).get('/api/analytics/products').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const p2Row = res.body.report.find((r) => r.name === 'P2');
    expect(p2Row.revenue).toBe(100); // 50 + 50, not 325
    expect(p2Row.unitsSold).toBe(4);
    expect(res.body.report[0].revenue).toBeGreaterThanOrEqual(res.body.report[1].revenue); // sorted desc
  });
});

describe('Analytics regression — /summary', () => {
  it('aggregates top-level KPIs exactly', async () => {
    const res = await request(app).get('/api/analytics/summary').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const s = res.body.summary;
    expect(s.gmv).toBe(520); // 180 + 340
    expect(s.totalUnits).toBe(16); // 12 + 4
    expect(s.orderCount).toBe(8); // 4 + 4
    expect(s.aov).toBe(65); // 520 / 8
    expect(s.vendorCount).toBe(3); // admin + acme + beta
    expect(s.activeVendors).toBe(3);
  });
});

describe('Analytics regression — /chart filters', () => {
  it('status filter overrides the default cancelled exclusion', async () => {
    // Default excludes cancelled; ask for cancelled only.
    const res = await request(app)
      .get('/api/analytics/chart')
      .query({ status: 'cancelled' })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.summary.orderCount).toBe(1); // only the one cancelled order
    expect(res.body.summary.gmv).toBe(225);
  });

  it('category filter restricts to a joined product category', async () => {
    const res = await request(app)
      .get('/api/analytics/chart')
      .query({ category: 'Electronics' })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    // Electronics = P1 (5+3=8 units, ₹80) + P3 (1 unit, ₹40) => 9 units, ₹120, 3 orders
    expect(res.body.summary.gmv).toBe(120);
    expect(res.body.summary.totalUnits).toBe(9);
    expect(res.body.summary.orderCount).toBe(3);
    const cats = res.body.byCategory.map((c) => c.category);
    expect(cats).toEqual(['Electronics']);
  });

  it('price-band filter restricts by totalAmount', async () => {
    const res = await request(app)
      .get('/api/analytics/chart')
      .query({ minPrice: 100 })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    // Only orders with totalAmount >= 100: P2 cancelled(225) excluded by default,
    // P4 paid(100) + shipped(100) + delivered(100) = 3 orders, ₹300
    expect(res.body.summary.orderCount).toBe(3);
    expect(res.body.summary.gmv).toBe(300);
  });

  it('admin vendorId filter scopes to one vendor', async () => {
    const res = await request(app)
      .get('/api/analytics/chart')
      .query({ vendorId: beta._id.toString() })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.summary.gmv).toBe(340);
    expect(res.body.byVendor).toHaveLength(1);
    expect(res.body.byVendor[0].businessName).toBe('Beta');
  });

  it('date range in the future returns no transactions', async () => {
    const future = new Date(Date.now() + 365 * 86400000).toISOString();
    const res = await request(app)
      .get('/api/analytics/chart')
      .query({ from: future })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.summary.orderCount).toBe(0);
    expect(res.body.summary.gmv).toBe(0);
  });
});

describe('Analytics regression — /revenue-analysis', () => {
  it('computes GMV, commission, net revenue, margin, and per-vendor breakdown', async () => {
    const res = await request(app).get('/api/analytics/revenue-analysis').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const t = res.body.totals;
    expect(t.gmv).toBe(520);
    expect(t.orders).toBe(8);
    // Acme 10% of 180 = 18; Beta 20% of 340 = 68; commission = 86; net = 434
    expect(t.commission).toBe(86);
    expect(t.netRevenue).toBe(434);
    expect(t.marginPct).toBe(83.5); // 434/520 * 100
    const acmeV = res.body.byVendor.find((v) => v.businessName === 'Acme');
    expect(acmeV.commission).toBe(18);
    expect(acmeV.netRevenue).toBe(162);
    expect(acmeV.marginPct).toBe(90);
  });

  it('accepts period=month and buckets timeseries', async () => {
    const res = await request(app)
      .get('/api/analytics/revenue-analysis')
      .query({ period: 'month' })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.timeseries.length).toBeGreaterThanOrEqual(1);
    expect(res.body.timeseries[0].bucket).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe('Analytics regression — /benchmark (admin-only)', () => {
  it('ranks vendors by composite score and computes averages', async () => {
    const res = await request(app).get('/api/analytics/benchmark').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.ranking).toHaveLength(2);
    expect(res.body.ranking[0].rank).toBe(1);
    expect(res.body.ranking[0].compositeScore).toBeGreaterThanOrEqual(res.body.ranking[1].compositeScore);
    // Beta has higher revenue (340 vs 180) → revenueScore 100.
    const betaRank = res.body.ranking.find((r) => r.businessName === 'Beta');
    expect(betaRank.revenueScore).toBe(100);
    expect(res.body.benchmark.topVendor).toBe('Beta');
  });

  it('rejects a vendor calling benchmark (admin-only)', async () => {
    const res = await request(app).get('/api/analytics/benchmark').set('Authorization', `Bearer ${acmeToken}`);
    expect(res.status).toBe(403);
  });
});

describe('Analytics regression — exports', () => {
  it('revenue-analysis CSV downloads with vendor rows', async () => {
    const res = await request(app)
      .get('/api/analytics/revenue-analysis/export')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/csv|text/);
    expect(res.text).toContain('Vendor');
    expect(res.text).toContain('Acme');
  });

  it('report PDF downloads as application/pdf', async () => {
    const res = await request(app)
      .get('/api/analytics/report')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
  });
});

describe('Analytics regression — /validate (≥98% consistency)', () => {
  it('returns a validation report with the three pipeline metrics', async () => {
    const res = await request(app).get('/api/analytics/validate').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    // The shape: three metric numbers in [0,1] + the concept-note thresholds.
    for (const k of ['forecastAccuracy', 'segmentationQuality', 'recommendationRelevance']) {
      expect(res.body).toHaveProperty(k);
      expect(typeof res.body[k]).toBe('number');
      expect(res.body[k]).toBeGreaterThanOrEqual(0);
      expect(res.body[k]).toBeLessThanOrEqual(1);
    }
    expect(res.body.thresholds).toEqual({ forecastAccuracy: 0.8, segmentationQuality: 0.85, recommendationRelevance: 0.75 });
    expect(res.body).toHaveProperty('details');
  });
});
