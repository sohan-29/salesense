import { connectTestDb } from './setup.js';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import Vendor from '../src/models/Vendor.js';
import Product from '../src/models/Product.js';
import Transaction from '../src/models/Transaction.js';

let app;
let adminToken;

beforeAll(async () => {
  await connectTestDb();
  app = createApp();

  const admin = new Vendor({
    businessName: 'Admin',
    contactEmail: 'admin@analytics.test',
    role: 'admin',
    status: 'Active',
  });
  await admin.setPassword('adminpass');
  await admin.save();

  const login = await request(app).post('/api/auth/admin/login').send({
    email: 'admin@analytics.test',
    password: 'adminpass',
  });
  adminToken = login.body.token;

  const vendor = new Vendor({
    businessName: 'Acme',
    contactEmail: 'acme@analytics.test',
    role: 'vendor',
    status: 'Active',
  });
  await vendor.setPassword('vendorpass');
  await vendor.save();

  const p1 = await Product.create({ vendorId: vendor._id, name: 'P1', category: 'Electronics', price: 10 });
  const p2 = await Product.create({ vendorId: vendor._id, name: 'P2', category: 'Home', price: 25 });

  // Known totals (excluding the cancelled order): revenue 180, units 12, orders 4
  await Transaction.create([
    { productId: p1._id, vendorId: vendor._id, quantity: 5, unitPrice: 10, totalAmount: 50, status: 'paid' },
    { productId: p1._id, vendorId: vendor._id, quantity: 3, unitPrice: 10, totalAmount: 30, status: 'paid' },
    { productId: p2._id, vendorId: vendor._id, quantity: 2, unitPrice: 25, totalAmount: 50, status: 'paid' },
    { productId: p2._id, vendorId: vendor._id, quantity: 2, unitPrice: 25, totalAmount: 50, status: 'paid' },
    // cancelled order must be excluded from revenue
    { productId: p2._id, vendorId: vendor._id, quantity: 9, unitPrice: 25, totalAmount: 225, status: 'cancelled' },
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe('GET /api/analytics — revenue consistency (≥98%)', () => {
  it('aggregates revenue by vendor, excluding cancelled orders', async () => {
    const res = await request(app)
      .get('/api/analytics/revenue')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const row = res.body.report.find((r) => r.businessName === 'Acme');
    expect(row).toBeDefined();
    expect(row.totalRevenue).toBe(180); // 50+30+50+50, not 405 (cancelled excluded)
    expect(row.totalUnitsSold).toBe(12); // 5+3+2+2
    expect(row.orderCount).toBe(4);
  });

  it('computes product performance (revenue + units), sorted by revenue desc', async () => {
    const res = await request(app)
      .get('/api/analytics/products')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.report.length).toBeGreaterThanOrEqual(2);
    // P2 revenue = 100, P1 revenue = 80 -> P2 first
    const top = res.body.report[0];
    expect(top.revenue).toBe(100);
    expect(top.name).toBe('P2');
  });

  it('summary KPIs match the known totals', async () => {
    const res = await request(app)
      .get('/api/analytics/summary')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const s = res.body.summary;
    expect(s.gmv).toBe(180);
    expect(s.totalUnits).toBe(12);
    expect(s.orderCount).toBe(4);
    expect(s.aov).toBe(45); // 180 / 4
    expect(s.vendorCount).toBeGreaterThanOrEqual(1);
    expect(s.activeVendors).toBeGreaterThanOrEqual(1);
  });
});

describe('GET /api/analytics/chart — filterable analytics', () => {
  it('returns aggregated chart payload matching the known totals', async () => {
    const res = await request(app)
      .get('/api/analytics/chart')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.summary.gmv).toBe(180);
    expect(res.body.summary.totalUnits).toBe(12);
    expect(res.body.summary.orderCount).toBe(4);
    expect(res.body.byCategory.length).toBe(2); // Electronics + Home
    expect(res.body.topProducts.length).toBe(2);
    expect(res.body.byVendor).toBeDefined(); // admin only
    expect(res.body.byVendor[0].businessName).toBe('Acme');
  });

  it('filters by category (Electronics only → P1, revenue 80)', async () => {
    const res = await request(app)
      .get('/api/analytics/chart')
      .query({ category: 'Electronics' })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.summary.gmv).toBe(80); // 50 + 30
    expect(res.body.summary.orderCount).toBe(2);
    expect(res.body.byCategory.length).toBe(1);
    expect(res.body.byCategory[0].category).toBe('Electronics');
  });

  it('filters by price range (maxPrice=40 → only the ₹30 order)', async () => {
    const res = await request(app)
      .get('/api/analytics/chart')
      .query({ maxPrice: 40 })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.summary.gmv).toBe(30);
    expect(res.body.summary.orderCount).toBe(1);
  });

  it('filters by status (cancelled → only the excluded ₹225 order)', async () => {
    const res = await request(app)
      .get('/api/analytics/chart')
      .query({ status: 'cancelled' })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.summary.gmv).toBe(225);
    expect(res.body.summary.orderCount).toBe(1);
    expect(res.body.byStatus[0].status).toBe('cancelled');
  });

  it('a vendor is scoped to their own data and gets no byVendor breakdown', async () => {
    const login = await request(app).post('/api/auth/vendor/login').send({
      email: 'acme@analytics.test',
      password: 'vendorpass',
    });
    const res = await request(app)
      .get('/api/analytics/chart')
      .set('Authorization', `Bearer ${login.body.token}`);

    expect(res.status).toBe(200);
    expect(res.body.summary.gmv).toBe(180); // Acme's own
    expect(res.body.byVendor).toBeUndefined(); // vendors don't get the vendor breakdown
  });
});

// --- M3: revenue-analysis + benchmark -------------------------------------
// Uses a dedicated vendor with a known commissionRate (20%) so commission and
// margin math are non-trivial and assertable.
describe('GET /api/analytics/revenue-analysis + /benchmark (M3)', () => {
  let m3AdminToken;
  let m3VendorToken;
  let m3Vendor;
  let m3Product;

  beforeAll(async () => {
    const admin = new Vendor({
      businessName: 'M3 Admin',
      contactEmail: 'admin@m3.test',
      role: 'admin',
      status: 'Active',
    });
    await admin.setPassword('adminpass');
    await admin.save();
    m3AdminToken = (await request(app).post('/api/auth/admin/login').send({ email: 'admin@m3.test', password: 'adminpass' })).body.token;

    m3Vendor = new Vendor({
      businessName: 'Commission Vendor',
      contactEmail: 'cv@m3.test',
      role: 'vendor',
      status: 'Active',
      commissionRate: 20, // 20% commission → margin 80%
    });
    await m3Vendor.setPassword('vpass');
    await m3Vendor.save();
    m3VendorToken = (await request(app).post('/api/auth/vendor/login').send({ email: 'cv@m3.test', password: 'vpass' })).body.token;

    m3Product = await Product.create({ vendorId: m3Vendor._id, name: 'M3P', category: 'Electronics', price: 100 });

    const DAY = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const tx = (daysAgo, status, amount) => ({
      productId: m3Product._id,
      vendorId: m3Vendor._id,
      quantity: 1,
      unitPrice: 100,
      totalAmount: amount,
      status,
      date: new Date(now - daysAgo * DAY),
    });
    // Current window (last 10 days): 2 paid orders @ 100 = 200 GMV.
    // Previous window (10-20 days ago): 1 paid order @ 100 = 100 GMV → +100% growth.
    // One delivered order for fulfilment = 1/3 = 33%.
    await Transaction.create([
      tx(2, 'paid', 100),
      tx(5, 'paid', 100),
      tx(15, 'paid', 100), // previous window
      tx(8, 'delivered', 100), // delivered for fulfilment
    ]);
  });

  it('revenue-analysis computes commission, margin, and growth', async () => {
    const DAY = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const from = new Date(now - 10 * DAY).toISOString();
    const to = new Date(now).toISOString();
    const res = await request(app)
      .get('/api/analytics/revenue-analysis')
      .query({ from, to, vendorId: m3Vendor._id.toString() }) // scope to this vendor only
      .set('Authorization', `Bearer ${m3AdminToken}`);

    expect(res.status).toBe(200);
    const t = res.body.totals;
    // Current window: 2 paid @100 + 1 delivered @100 = 300 GMV (3 orders).
    expect(t.gmv).toBe(300);
    expect(t.commission).toBe(60); // 20% of 300
    expect(t.netRevenue).toBe(240); // 300 - 60
    expect(t.marginPct).toBe(80); // 240/300
    expect(t.orders).toBe(3);
    // Previous window had 100 GMV → growth = (300-100)/100*100 = 200%.
    expect(res.body.growth.gmvPct).toBe(200);
    // Per-vendor growth present.
    expect(res.body.byVendor[0].gmvGrowthPct).toBe(200);
  });

  it('benchmark ranks vendors and computes fulfilment + composite', async () => {
    const res = await request(app)
      .get('/api/analytics/benchmark')
      .query({ vendorId: m3Vendor._id.toString() }) // scope to this vendor only
      .set('Authorization', `Bearer ${m3AdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.ranking.length).toBe(1);
    const row = res.body.ranking[0];
    expect(row.businessName).toBe('Commission Vendor');
    // 4 total orders for this vendor, 1 delivered → fulfilment 1/4.
    expect(row.fulfilmentRate).toBeCloseTo(0.25, 2);
    expect(row.compositeScore).toBeGreaterThan(0);
    expect(row.rank).toBe(1);
    expect(res.body.benchmark.topVendor).toBe('Commission Vendor');
  });

  it('benchmark is admin-only (vendor gets 403)', async () => {
    const res = await request(app)
      .get('/api/analytics/benchmark')
      .set('Authorization', `Bearer ${m3VendorToken}`);
    expect(res.status).toBe(403);
  });
});


// --- M3 Phase 2: CSV/PDF export ------------------------------------------
describe('GET /api/analytics/export — CSV + PDF', () => {
  it('revenue-analysis/export returns CSV with vendor rows', async () => {
    const res = await request(app)
      .get('/api/analytics/revenue-analysis/export')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('revenue-analysis.csv');
    expect(res.text).toContain('Vendor,GMV,Net Revenue');
    expect(res.text).toContain('Acme');
  });

  it('benchmark/export returns CSV with the ranking', async () => {
    const res = await request(app)
      .get('/api/analytics/benchmark/export')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('Rank,Vendor,Revenue');
    expect(res.text).toContain('Composite Score');
  });

  it('report returns a PDF (application/pdf, non-empty, %PDF magic)', async () => {
    const res = await request(app)
      .get('/api/analytics/report')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toContain('shopsense-bi-report.pdf');
    expect(res.body.length).toBeGreaterThan(100);
    expect(Buffer.from(res.body.slice(0, 4)).toString('ascii')).toBe('%PDF');
  });

  it('PDF report is admin-only (vendor gets 403)', async () => {
    const v = new Vendor({ businessName: 'ExportVendor', contactEmail: 'exp@test.test', role: 'vendor', status: 'Active' });
    await v.setPassword('p123456');
    await v.save();
    const login = await request(app).post('/api/auth/vendor/login').send({ email: 'exp@test.test', password: 'p123456' });
    const res = await request(app).get('/api/analytics/report').set('Authorization', `Bearer ${login.body.token}`);
    expect(res.status).toBe(403);
  });
});
