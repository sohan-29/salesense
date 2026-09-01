import { connectTestDb, makeCustomer, backdate } from './setup.js';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import Vendor from '../src/models/Vendor.js';
import Customer from '../src/models/Customer.js';
import Product from '../src/models/Product.js';
import Transaction from '../src/models/Transaction.js';
import MLCustomerSegment from '../src/models/MLCustomerSegment.js';

const DAY = 24 * 60 * 60 * 1000;

let app;
let adminToken;
let products;
let customers;

/**
 * Simulate the Python write-back (ml/recommender/segmentation.py) by inserting
 * `ml_segments` rows directly — the Node side only ever reads this collection,
 * so tests don't need Python or the real K-Means model.
 */
async function writeMLSegments(rows, generatedAt = new Date()) {
  for (const r of rows) {
    await MLCustomerSegment.collection.updateOne(
      { customerId: r.customerId },
      {
        $set: {
          customerId: r.customerId,
          cluster: r.cluster,
          segment: r.segment,
          features: r.features || {},
          model: 'kmeans',
          k: r.k ?? 3,
          silhouette: r.silhouette ?? 0.5,
          generatedAt: r.generatedAt || generatedAt,
        },
      },
      { upsert: true }
    );
  }
}

beforeAll(async () => {
  await connectTestDb();
  app = createApp();

  const admin = new Vendor({ businessName: 'Admin', contactEmail: 'admin@segml.test', role: 'admin', status: 'Active' });
  await admin.setPassword('adminpass');
  await admin.save();
  adminToken = (await request(app).post('/api/auth/admin/login').send({ email: 'admin@segml.test', password: 'adminpass' })).body.token;

  const vendor = new Vendor({ businessName: 'V', contactEmail: 'v@segml.test', role: 'vendor', status: 'Active' });
  await vendor.setPassword('p');
  await vendor.save();

  products = await Product.create([
    { vendorId: vendor._id, name: 'A', category: 'Electronics', price: 10 },
    { vendorId: vendor._id, name: 'B', category: 'Home', price: 20 },
  ]);

  customers = await Promise.all([
    makeCustomer({ name: 'Prem', email: 'prem@segml.test' }),
    makeCustomer({ name: 'Reg', email: 'reg@segml.test' }),
    makeCustomer({ name: 'Ina', email: 'ina@segml.test' }),
    makeCustomer({ name: 'Newbie', email: 'newbie@segml.test' }),
  ]);

  const now = Date.now();
  const tx = (customerId, productId, daysAgo, qty = 1) => ({
    customerId,
    productId,
    vendorId: vendor._id,
    quantity: qty,
    unitPrice: 20,
    totalAmount: 20 * qty,
    status: 'paid',
    date: new Date(now - daysAgo * DAY),
  });

  // Purchases that predate the ML cache generation (so the cache is fresh
  // relative to them). The K-Means rows below drive the served segments.
  await Transaction.create([
    tx(customers[0]._id, products[0]._id, 30, 5), // premium: high spend
    tx(customers[1]._id, products[1]._id, 10), // regular
    tx(customers[2]._id, products[0]._id, 90), // inactive: old purchase
    // customers[3]: never purchased
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe('GET /api/customers/segments (K-Means cache)', () => {
  beforeEach(async () => {
    await MLCustomerSegment.collection.deleteMany({});
  });

  it('serves ML segments with labels, clusters and model metadata', async () => {
    await writeMLSegments([
      { customerId: customers[0]._id, cluster: 0, segment: 'premium' },
      { customerId: customers[1]._id, cluster: 1, segment: 'regular' },
      { customerId: customers[2]._id, cluster: 2, segment: 'inactive' },
      { customerId: customers[3]._id, cluster: 1, segment: 'new' },
    ]);

    const res = await request(app).get('/api/customers/segments').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('kmeans');
    expect(res.body.model).toMatchObject({ k: 3, silhouette: 0.5 });

    const emails = (seg) => (res.body.segments[seg] || []).map((c) => c.email);
    expect(emails('premium')).toContain('prem@segml.test');
    expect(emails('regular')).toContain('reg@segml.test');
    expect(emails('inactive')).toContain('ina@segml.test');
    expect(emails('new')).toContain('newbie@segml.test');

    // Cluster id and features ride along for transparency.
    const prem = res.body.segments.premium.find((c) => c.email === 'prem@segml.test');
    expect(prem.cluster).toBe(0);
    expect(prem.features).toBeDefined();

    expect(res.body.summary.total).toBe(4);
    expect(res.body.summary.counts.premium).toBe(1);
  });

  it('falls back to RFM rules when the ml_segments cache is empty', async () => {
    const res = await request(app).get('/api/customers/segments').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('rules-fallback');
    // The five rule labels are present and every customer is bucketed.
    expect(res.body.summary.total).toBe(4);
    const all = Object.values(res.body.segments).flat().map((c) => c.email);
    expect(all).toHaveLength(4);
  });

  it('ignores stale cache rows and falls back', async () => {
    // generatedAt far in the past → beyond ML_SEGMENT_MAX_AGE_MIN (default 1440).
    const stale = new Date(Date.now() - 3 * DAY);
    await writeMLSegments(
      customers.map((c, i) => ({ customerId: c._id, cluster: i, segment: 'regular' })),
      stale
    );

    const res = await request(app).get('/api/customers/segments').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('rules-fallback');
  });

  it('marks a row stale when the customer purchased after it was generated', async () => {
    // Cache generated 5 hours ago (inside the freshness window), but the
    // customer bought 1 hour ago — after generation.
    const generatedAt = new Date(Date.now() - 5 * 60 * 60 * 1000);
    await writeMLSegments(
      customers.map((c, i) => ({ customerId: c._id, cluster: i, segment: 'regular' })),
      generatedAt
    );
    await Transaction.create({
      customerId: customers[0]._id,
      productId: products[1]._id,
      vendorId: products[0].vendorId,
      quantity: 1,
      unitPrice: 20,
      totalAmount: 20,
      status: 'paid',
      date: new Date(Date.now() - 1 * 60 * 60 * 1000),
    });

    const res = await request(app).get('/api/customers/segments').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('kmeans'); // non-purchasing rows still served
    // The purchaser dropped out of the ML view (their row is stale).
    const served = Object.values(res.body.segments).flat().map((c) => c.email);
    expect(served).not.toContain('prem@segml.test');
    expect(served).toContain('reg@segml.test');
  });

  it('requires admin', async () => {
    const res = await request(app).get('/api/customers/segments');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/customers (list with ML segments)', () => {
  beforeEach(async () => {
    await MLCustomerSegment.collection.deleteMany({});
  });

  it('enriches the customer list with the ML segment and source marker', async () => {
    await writeMLSegments([{ customerId: customers[0]._id, cluster: 0, segment: 'premium' }]);

    const res = await request(app).get('/api/customers').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const byEmail = Object.fromEntries(res.body.customers.map((c) => [c.email, c]));
    expect(byEmail['prem@segml.test'].segment).toBe('premium');
    expect(byEmail['prem@segml.test'].segmentSource).toBe('kmeans');
    expect(byEmail['prem@segml.test'].cluster).toBe(0);
    // No fresh ML row → rules fallback per customer.
    expect(byEmail['reg@segml.test'].segmentSource).toBe('rules-fallback');
  });
});
