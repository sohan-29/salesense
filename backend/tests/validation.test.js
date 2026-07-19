import { connectTestDb, makeCustomer, backdate } from './setup.js';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import Vendor from '../src/models/Vendor.js';
import Customer from '../src/models/Customer.js';
import Product from '../src/models/Product.js';
import Transaction from '../src/models/Transaction.js';

const DAY = 24 * 60 * 60 * 1000;

let app;
let adminToken;

beforeAll(async () => {
  await connectTestDb();
  app = createApp();

  const admin = new Vendor({ businessName: 'Admin', contactEmail: 'admin@val.test', role: 'admin', status: 'Active' });
  await admin.setPassword('adminpass');
  await admin.save();
  adminToken = (await request(app).post('/api/auth/admin/login').send({ email: 'admin@val.test', password: 'adminpass' })).body.token;

  const vendor = new Vendor({ businessName: 'V', contactEmail: 'v@val.test', role: 'vendor', status: 'Active' });
  await vendor.setPassword('p');
  await vendor.save();

  // 3 products, all priced alike and all with steady daily demand across a
  // 40-day span so the moving-average forecast (train) matches the test
  // window, and so the frequent cluster has uniform monetary value (tight).
  //   A, B, C — partial co-purchase overlap drives the recommendation signal.
  const PRICE = 10;
  const products = await Product.create([
    { vendorId: vendor._id, name: 'Steady A', category: 'Electronics', price: PRICE },
    { vendorId: vendor._id, name: 'Steady B', category: 'Electronics', price: PRICE },
    { vendorId: vendor._id, name: 'Steady C', category: 'Electronics', price: PRICE },
  ]);

  // Customers: two well-separated clusters for segmentation quality.
  //   cluster 1: frequent (recent, many orders, high spend — uniform across F1/F2/F3)
  //   cluster 2: dormant (old, single order, low spend)
  const customers = await Promise.all([
    makeCustomer({ name: 'F1', email: 'f1@val.test' }),
    makeCustomer({ name: 'F2', email: 'f2@val.test' }),
    makeCustomer({ name: 'F3', email: 'f3@val.test' }),
    makeCustomer({ name: 'D1', email: 'd1@val.test' }),
    makeCustomer({ name: 'D2', email: 'd2@val.test' }),
    makeCustomer({ name: 'D3', email: 'd3@val.test' }),
  ]);
  // Backdate dormant join dates so they segment cleanly.
  const now = Date.now();
  await backdate(Customer, customers[3]._id, 150);
  await backdate(Customer, customers[4]._id, 150);
  await backdate(Customer, customers[5]._id, 150);

  // Steady demand (days 39..3). Each frequent customer buys 2 units/day
  // ($20/day) so their RFM vectors cluster tightly:
  //   F1 owns {A,B}: A(1)+B(1)   F2 owns {A,C}: A(1)+C(1)   F3 owns {C}: C(2)
  // Co-purchase overlap: F1∩F2={A}, F2∩F3={C} → CF recommends C→F1, B→F2.
  const docs = [];
  for (let d = 39; d >= 3; d--) {
    const date = new Date(now - d * DAY);
    docs.push({ productId: products[0]._id, vendorId: vendor._id, customerId: customers[0]._id, quantity: 1, unitPrice: PRICE, totalAmount: PRICE, status: 'paid', date });
    docs.push({ productId: products[1]._id, vendorId: vendor._id, customerId: customers[0]._id, quantity: 1, unitPrice: PRICE, totalAmount: PRICE, status: 'paid', date });
    docs.push({ productId: products[0]._id, vendorId: vendor._id, customerId: customers[1]._id, quantity: 1, unitPrice: PRICE, totalAmount: PRICE, status: 'paid', date });
    docs.push({ productId: products[2]._id, vendorId: vendor._id, customerId: customers[1]._id, quantity: 1, unitPrice: PRICE, totalAmount: PRICE, status: 'paid', date });
    docs.push({ productId: products[2]._id, vendorId: vendor._id, customerId: customers[2]._id, quantity: 2, unitPrice: PRICE, totalAmount: 2 * PRICE, status: 'paid', date });
  }

  // Held-out "new product" purchases (day 1, the most recent for each): F1
  // buys C (not owned in train), F2 buys B (not owned in train). CF must
  // recommend each → exact-product hit.
  docs.push({ productId: products[2]._id, vendorId: vendor._id, customerId: customers[0]._id, quantity: 1, unitPrice: PRICE, totalAmount: PRICE, status: 'paid', date: new Date(now - 1 * DAY) });
  docs.push({ productId: products[1]._id, vendorId: vendor._id, customerId: customers[1]._id, quantity: 1, unitPrice: PRICE, totalAmount: PRICE, status: 'paid', date: new Date(now - 1 * DAY) });

  // Dormant customers: one old purchase each, low spend (tight low cluster).
  docs.push({ productId: products[0]._id, vendorId: vendor._id, customerId: customers[3]._id, quantity: 1, unitPrice: PRICE, totalAmount: PRICE, status: 'paid', date: new Date(now - 90 * DAY) });
  docs.push({ productId: products[1]._id, vendorId: vendor._id, customerId: customers[4]._id, quantity: 1, unitPrice: PRICE, totalAmount: PRICE, status: 'paid', date: new Date(now - 95 * DAY) });
  docs.push({ productId: products[2]._id, vendorId: vendor._id, customerId: customers[5]._id, quantity: 1, unitPrice: PRICE, totalAmount: PRICE, status: 'paid', date: new Date(now - 92 * DAY) });

  await Transaction.create(docs);
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe('GET /api/analytics/validate — backtesting', () => {
  it('returns all three metrics with thresholds', async () => {
    const res = await request(app).get('/api/analytics/validate').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('forecastAccuracy');
    expect(res.body).toHaveProperty('segmentationQuality');
    expect(res.body).toHaveProperty('recommendationRelevance');
    expect(res.body.thresholds).toEqual({ forecastAccuracy: 0.8, segmentationQuality: 0.85, recommendationRelevance: 0.75 });
    expect(res.body.details).toBeTruthy();
  });

  it('meets the forecast accuracy threshold (≥0.80) on steady demand', async () => {
    const res = await request(app).get('/api/analytics/validate').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.forecastAccuracy).toBeGreaterThanOrEqual(0.8);
  });

  it('meets the segmentation quality threshold (≥0.85) on separated clusters', async () => {
    const res = await request(app).get('/api/analytics/validate').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.segmentationQuality).toBeGreaterThanOrEqual(0.85);
  });

  it('meets the recommendation relevance threshold (≥0.75) on co-purchase signal', async () => {
    const res = await request(app).get('/api/analytics/validate').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.recommendationRelevance).toBeGreaterThanOrEqual(0.75);
  });

  it('requires admin/vendor auth', async () => {
    const res = await request(app).get('/api/analytics/validate');
    expect(res.status).toBe(401);
  });
});
