import { connectTestDb, makeCustomer } from './setup.js';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import Vendor from '../src/models/Vendor.js';
import Product from '../src/models/Product.js';
import Transaction from '../src/models/Transaction.js';
import MLRecommendation from '../src/models/MLRecommendation.js';

const DAY = 24 * 60 * 60 * 1000;

let app;
let adminToken;
let customers;
let products;
let vendor;

beforeAll(async () => {
  await connectTestDb();
  app = createApp();

  const admin = new Vendor({ businessName: 'Admin', contactEmail: 'admin@ml.test', role: 'admin', status: 'Active' });
  await admin.setPassword('adminpass');
  await admin.save();
  adminToken = (await request(app).post('/api/auth/admin/login').send({ email: 'admin@ml.test', password: 'adminpass' })).body.token;

  vendor = new Vendor({ businessName: 'V', contactEmail: 'v@ml.test', role: 'vendor', status: 'Active' });
  await vendor.setPassword('p');
  await vendor.save();

  products = await Product.create([
    { vendorId: vendor._id, name: 'Mouse', category: 'Electronics', price: 10, status: 'active' },
    { vendorId: vendor._id, name: 'Keyboard', category: 'Electronics', price: 15, status: 'active' },
    { vendorId: vendor._id, name: 'Mug', category: 'Home', price: 5, status: 'active' },
    { vendorId: vendor._id, name: 'Plate', category: 'Home', price: 8, status: 'active' },
  ]);

  customers = await Promise.all([
    makeCustomer({ name: 'Cached', email: 'cached@ml.test', password: 'pw123456' }),
    makeCustomer({ name: 'Similar', email: 'similar@ml.test' }),
  ]);

  const now = Date.now();
  const tx = (customerId, productId, daysAgo) => ({
    customerId,
    productId,
    vendorId: vendor._id,
    quantity: 1,
    unitPrice: 10,
    totalAmount: 10,
    status: 'paid',
    date: new Date(now - daysAgo * DAY),
  });

  // Cached bought Mouse + Mug long ago; Similar bought the same plus Keyboard + Plate,
  // so JS CF has a signal for the fallback path (Keyboard/Plate co-purchased).
  await Transaction.create([
    tx(customers[0]._id, products[0]._id, 10),
    tx(customers[0]._id, products[2]._id, 9),
    tx(customers[1]._id, products[0]._id, 10),
    tx(customers[1]._id, products[2]._id, 9),
    tx(customers[1]._id, products[1]._id, 8),
    tx(customers[1]._id, products[3]._id, 7),
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
});

beforeEach(async () => {
  // Each test starts with no cache rows so freshness state is unambiguous.
  await MLRecommendation.deleteMany({});
});

async function writeCache(customerId, model, items, generatedAt = new Date()) {
  await MLRecommendation.replaceOne(
    { customerId, model },
    { customerId, model, generatedAt, items },
    { upsert: true }
  );
}

describe('GET /api/recommendations — ML cache (batch write-back)', () => {
  it('serves fresh ML-cached recommendations when present', async () => {
    await writeCache(customers[0]._id, 'svd', [
      { productId: products[1]._id, score: 0.9, reason: 'svd', category: 'Electronics' },
      { productId: products[3]._id, score: 0.8, reason: 'svd', category: 'Home' },
    ]);

    const res = await request(app)
      .get('/api/recommendations')
      .query({ customerId: customers[0]._id.toString(), limit: 5 })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.recommendations.map((r) => r.product._id);
    expect(ids).toEqual([products[1]._id.toString(), products[3]._id.toString()]);
    expect(res.body.recommendations[0].reason).toBe('svd');
  });

  it('falls back to JS CF when the cache is stale (customer bought after generatedAt)', async () => {
    // Cache generated before the customer's most recent (day-9) purchase.
    await writeCache(
      customers[0]._id,
      'cosine',
      [{ productId: products[3]._id, score: 0.5, reason: 'cosine', category: 'Home' }],
      new Date(Date.now() - 11 * DAY) // older than the day-9 Mouse purchase
    );

    const res = await request(app)
      .get('/api/recommendations')
      .query({ customerId: customers[0]._id.toString(), limit: 5 })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    // Stale cache (cosine) is skipped; JS CF serves co-purchased Keyboard/Plate.
    const ids = res.body.recommendations.map((r) => r.product._id);
    expect(ids).toContain(products[1]._id.toString());
    expect(ids).toContain(products[3]._id.toString());
    expect(res.body.recommendations[0].reason).toBe('collaborative');
  });

  it('falls back to JS CF when no cache row exists', async () => {
    const res = await request(app)
      .get('/api/recommendations')
      .query({ customerId: customers[0]._id.toString(), limit: 5 })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.recommendations.map((r) => r.product._id);
    expect(ids).toContain(products[1]._id.toString());
    expect(res.body.recommendations[0].reason).toBe('collaborative');
  });
});
