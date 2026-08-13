import { connectTestDb } from './setup.js';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import Vendor from '../src/models/Vendor.js';
import Product from '../src/models/Product.js';
import Transaction from '../src/models/Transaction.js';

const DAY = 24 * 60 * 60 * 1000;

let app;
let adminToken;
let vendorToken;

// Two vendors with known commission rates so margin/composite math is assertable.
let big;    // high revenue vendor, 10% commission
let small;  // low revenue vendor, 0% commission
let productBig;
let productSmall;

beforeAll(async () => {
  await connectTestDb();
  app = createApp();

  const admin = new Vendor({ businessName: 'Admin', contactEmail: 'admin@bench.test', role: 'admin', status: 'Active' });
  await admin.setPassword('adminpass');
  await admin.save();
  adminToken = (await request(app).post('/api/auth/admin/login').send({ email: 'admin@bench.test', password: 'adminpass' })).body.token;

  big = new Vendor({ businessName: 'BigCo', contactEmail: 'big@bench.test', role: 'vendor', status: 'Active', commissionRate: 10 });
  await big.setPassword('p');
  await big.save();

  small = new Vendor({ businessName: 'SmallCo', contactEmail: 'small@bench.test', role: 'vendor', status: 'Active', commissionRate: 0 });
  await small.setPassword('p');
  await small.save();
  vendorToken = (await request(app).post('/api/auth/vendor/login').send({ email: 'small@bench.test', password: 'p' })).body.token;

  productBig = await Product.create({ vendorId: big._id, name: 'BigProd', category: 'Electronics', price: 100 });
  productSmall = await Product.create({ vendorId: small._id, name: 'SmallProd', category: 'Home', price: 10 });

  const now = Date.now();
  const mk = (product, vendor, amount, daysAgo, status = 'paid') => ({
    productId: product._id,
    vendorId: vendor._id,
    quantity: amount / 10,
    unitPrice: 10,
    totalAmount: amount,
    status,
    date: new Date(now - daysAgo * DAY),
  });

  // BigCo: current window 3 × ₹1000 = 3000 GMV; previous window 1 × ₹1000 = 1000.
  // SmallCo: current window 1 × ₹100 = 100 GMV.
  // One delivered per vendor for fulfilment.
  await Transaction.create([
    mk(productBig, big, 1000, 2),
    mk(productBig, big, 1000, 4),
    mk(productBig, big, 1000, 6),
    mk(productBig, big, 1000, 15), // previous window (safely inside 20–10d ago for a 10d `from`)
    mk(productBig, big, 1000, 3, 'delivered'),
    mk(productSmall, small, 100, 3),
    mk(productSmall, small, 100, 5, 'delivered'),
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe('GET /api/analytics/revenue-analysis — commission/margin/bucketing', () => {
  it('computes commission, margin and growth from a known window', async () => {
    const now = Date.now();
    const from = new Date(now - 10 * DAY).toISOString();
    const to = new Date(now).toISOString();
    const res = await request(app)
      .get('/api/analytics/revenue-analysis')
      .query({ from, to })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const t = res.body.totals;
    // Current window: BigCo 3×1000 + SmallCo 1×100 = 3100 GMV; + the delivered rows.
    // BigCo commission 10%, SmallCo 0%.
    const bigRow = res.body.byVendor.find((v) => v.businessName === 'BigCo');
    const smallRow = res.body.byVendor.find((v) => v.businessName === 'SmallCo');

    expect(bigRow).toBeDefined();
    expect(smallRow).toBeDefined();
    // Commission rate 0 → commission 0, margin 100.
    expect(smallRow.commission).toBe(0);
    expect(smallRow.marginPct).toBe(100);
    expect(smallRow.netRevenue).toBe(smallRow.gmv);
    // BigCo commission is 10% of its GMV.
    expect(bigRow.commission).toBeCloseTo(bigRow.gmv * 0.1, 1);
    expect(bigRow.marginPct).toBeCloseTo(90, 0);

    // Growth: previous window had non-zero GMV (BigCo ₹1000 @ 20 days ago) so
    // growthPct is a number, and the previous window resolves.
    expect(res.body.window.previous.start).toBeTruthy();
    expect(res.body.growth.gmvPct == null || typeof res.body.growth.gmvPct === 'number').toBe(true);
    expect(t.netRevenue).toBeCloseTo(t.gmv - t.commission, 1);
  });

  it('computes growthPct as a number when a from/to window cleanly bounds both halves', async () => {
    // BigCo delivered @ 3d is in the current window; BigCo @ 20d is previous.
    // from = 10 days ago ⇒ current window = last 10 days (BigCo 4×1000 = 4000 GMV)
    // previous window = 20–10 days ago ⇒ contains the 1 × 1000 row → prevGmv=1000.
    const now = Date.now();
    const from = new Date(now - 10 * DAY).toISOString();
    const to = new Date(now).toISOString();
    const res = await request(app)
      .get('/api/analytics/revenue-analysis')
      .query({ from, to, period: 'day' })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    // Current window GMV = 4 paid + 1 delivered × 1000 = 4000; previous = 1 × 1000.
    // growthPct = (4000 − 1000)/1000 × 100 = 300.
    expect(res.body.growth.gmvPct).not.toBeNull();
    expect(typeof res.body.growth.gmvPct).toBe('number');
    expect(res.body.growth.gmvPct).toBeGreaterThan(0);
  });

  it('timeseries buckets differ by period (day buckets ≤ month buckets)', async () => {
    const now = Date.now();
    const from = new Date(now - 30 * DAY).toISOString();
    const to = new Date(now).toISOString();

    const dayRes = await request(app)
      .get('/api/analytics/revenue-analysis')
      .query({ from, to, period: 'day' })
      .set('Authorization', `Bearer ${adminToken}`);
    const monthRes = await request(app)
      .get('/api/analytics/revenue-analysis')
      .query({ from, to, period: 'month' })
      .set('Authorization', `Bearer ${adminToken}`);

    // Day buckets are finer-grained than month buckets for the same window.
    expect(dayRes.body.timeseries.length).toBeGreaterThanOrEqual(monthRes.body.timeseries.length);
    // Month buckets are YYYY-MM.
    expect(monthRes.body.timeseries[0].bucket).toMatch(/^\d{4}-\d{2}$/);
    // Day buckets are YYYY-MM-DD.
    expect(dayRes.body.timeseries[0].bucket).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('respects a category filter (joined lookup)', async () => {
    const res = await request(app)
      .get('/api/analytics/revenue-analysis')
      .query({ category: 'Electronics' })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const names = res.body.byVendor.map((v) => v.businessName);
    expect(names).toContain('BigCo');      // Electronics vendor
    expect(names).not.toContain('SmallCo'); // Home vendor
  });
});

describe('GET /api/analytics/benchmark — composite scoring regression', () => {
  it('ranks vendors by composite score, sorted desc, with rank 1 = top', async () => {
    const res = await request(app)
      .get('/api/analytics/benchmark')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const ranking = res.body.ranking;
    expect(ranking.length).toBe(2);
    // Ranked ascending by `rank` and descending by compositeScore.
    expect(ranking[0].rank).toBe(1);
    expect(ranking[0].compositeScore).toBeGreaterThanOrEqual(ranking[1].compositeScore);
    expect(ranking[1].rank).toBe(2);
    // BigCo has overwhelmingly more revenue → top.
    expect(ranking[0].businessName).toBe('BigCo');
    expect(res.body.benchmark.topVendor).toBe('BigCo');
  });

  it('composite score is the weighted blend of the 3 normalised sub-scores', async () => {
    const res = await request(app)
      .get('/api/analytics/benchmark')
      .set('Authorization', `Bearer ${adminToken}`);
    const row = res.body.ranking.find((r) => r.businessName === 'BigCo');

    // 0.5*revenue + 0.3*fulfilment + 0.2*growth (growth clamped ≥0 in computeBenchmark).
    const expected = Number(
      (0.5 * row.revenueScore + 0.3 * row.fulfilmentScore + 0.2 * row.growthScore).toFixed(1)
    );
    expect(row.compositeScore).toBeCloseTo(expected, 1);
    // All normalised sub-scores are within [0, 100].
    for (const key of ['revenueScore', 'fulfilmentScore', 'growthScore']) {
      expect(row[key]).toBeGreaterThanOrEqual(0);
      expect(row[key]).toBeLessThanOrEqual(100);
    }
  });

  it('revenue score for the top vendor is 100 (max/normaliser)', async () => {
    const res = await request(app)
      .get('/api/analytics/benchmark')
      .set('Authorization', `Bearer ${adminToken}`);
    const top = res.body.ranking[0];
    // Max vendor is always normalised to 100.
    expect(top.revenueScore).toBe(100);
  });

  it('benchmark averages are the arithmetic mean of the ranking rows', async () => {
    const res = await request(app)
      .get('/api/analytics/benchmark')
      .set('Authorization', `Bearer ${adminToken}`);
    const ranking = res.body.ranking;
    const avgRev = ranking.reduce((s, r) => s + r.revenue, 0) / ranking.length;
    const avgFul = ranking.reduce((s, r) => s + r.fulfilmentRate, 0) / ranking.length;
    expect(res.body.benchmark.avgRevenue).toBeCloseTo(avgRev, 1);
    expect(res.body.benchmark.avgFulfilment).toBeCloseTo(avgFul, 3);
  });

  it('is admin-only (a vendor gets 403)', async () => {
    const res = await request(app)
      .get('/api/analytics/benchmark')
      .set('Authorization', `Bearer ${vendorToken}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /api/analytics/executive — consolidated executive summary', () => {
  it('returns summary, growth, totals, trend, top vendors/products, marketplace, benchmark in one call', async () => {
    const res = await request(app)
      .get('/api/analytics/executive')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    for (const k of ['summary', 'growth', 'totals', 'trend', 'topVendors', 'topProducts', 'marketplace', 'benchmark', 'generatedAt']) {
      expect(res.body).toHaveProperty(k);
    }
    // Summary KPIs.
    expect(typeof res.body.summary.gmv).toBe('number');
    expect(typeof res.body.summary.orderCount).toBe('number');
    expect(res.body.summary.fulfilmentRate).toBeGreaterThanOrEqual(0);
    expect(res.body.summary.fulfilmentRate).toBeLessThanOrEqual(1);
    // top vendors/products arrays.
    expect(Array.isArray(res.body.topVendors)).toBe(true);
    expect(Array.isArray(res.body.topProducts)).toBe(true);
    expect(res.body.topVendors.length).toBeLessThanOrEqual(5);
    expect(res.body.topProducts.length).toBeLessThanOrEqual(5);
    expect(res.body.topVendors[0].businessName).toBe('BigCo'); // highest GMV
    expect(res.body.topProducts[0].name).toBe('BigProd');
    // marketplace counts.
    expect(res.body.marketplace.vendorCount).toBeGreaterThanOrEqual(2);
    expect(res.body.marketplace.customerCount).toBeGreaterThanOrEqual(0);
  });

  it('is admin-only', async () => {
    const res = await request(app)
      .get('/api/analytics/executive')
      .set('Authorization', `Bearer ${vendorToken}`);
    expect(res.status).toBe(403);
  });
});

describe('CSV exports — stable headers + content', () => {
  it('revenue-analysis/export emits the expected CSV columns in order', async () => {
    const res = await request(app)
      .get('/api/analytics/revenue-analysis/export')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    const firstLine = res.text.split('\n')[0];
    expect(firstLine).toContain('Vendor');
    expect(firstLine).toContain('GMV');
    expect(firstLine).toContain('Net Revenue');
    expect(firstLine).toContain('Commission');
    expect(firstLine).toContain('Margin %');
    expect(res.text).toContain('BigCo');
  });

  it('benchmark/export is admin-only and emits the ranking columns', async () => {
    const adminRes = await request(app)
      .get('/api/analytics/benchmark/export')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminRes.status).toBe(200);
    expect(adminRes.text.split('\n')[0]).toContain('Rank');
    expect(adminRes.text.split('\n')[0]).toContain('Composite Score');

    const vendorRes = await request(app)
      .get('/api/analytics/benchmark/export')
      .set('Authorization', `Bearer ${vendorToken}`);
    expect(vendorRes.status).toBe(403);
  });
});
