import { connectTestDb, makeCustomer } from './setup.js';
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
let customerToken;
let products;
let customers;

beforeAll(async () => {
  await connectTestDb();
  app = createApp();

  const admin = new Vendor({ businessName: 'Admin', contactEmail: 'admin@rec.test', role: 'admin', status: 'Active' });
  await admin.setPassword('adminpass');
  await admin.save();
  adminToken = (await request(app).post('/api/auth/admin/login').send({ email: 'admin@rec.test', password: 'adminpass' })).body.token;

  const vendor = new Vendor({ businessName: 'V', contactEmail: 'v@rec.test', role: 'vendor', status: 'Active' });
  await vendor.setPassword('p');
  await vendor.save();

  // 4 products in 2 categories.
  products = await Product.create([
    { vendorId: vendor._id, name: 'Mouse', category: 'Electronics', price: 10, status: 'active' },
    { vendorId: vendor._id, name: 'Keyboard', category: 'Electronics', price: 15, status: 'active' },
    { vendorId: vendor._id, name: 'Mug', category: 'Home', price: 5, status: 'active' },
    { vendorId: vendor._id, name: 'Plate', category: 'Home', price: 8, status: 'active' },
  ]);

  customers = await Promise.all([
    makeCustomer({ name: 'Target', email: 'target@rec.test', password: 'pw123456' }),
    makeCustomer({ name: 'Similar', email: 'similar@rec.test' }),
    makeCustomer({ name: 'Cold', email: 'cold@rec.test' }), // no history
  ]);

  // Target already has a password set above; log in as them.
  customerToken = (await request(app).post('/api/auth/customer/login').send({ email: 'target@rec.test', password: 'pw123456' })).body.token;

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

  await Transaction.create([
    // Target bought Mouse + Mug (Mouse twice → unambiguous top seller).
    tx(customers[0]._id, products[0]._id, 10),
    tx(customers[0]._id, products[0]._id, 11),
    tx(customers[0]._id, products[2]._id, 9),
    // Similar buyer also bought Mouse + Mug, PLUS Keyboard + Plate.
    tx(customers[1]._id, products[0]._id, 10),
    tx(customers[1]._id, products[2]._id, 9),
    tx(customers[1]._id, products[1]._id, 8), // Keyboard — strong CF candidate
    tx(customers[1]._id, products[3]._id, 7), // Plate — strong CF candidate
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe('GET /api/recommendations', () => {
  it('recommends co-purchased products the target has not bought (collaborative)', async () => {
    const res = await request(app)
      .get('/api/recommendations')
      .query({ customerId: customers[0]._id.toString(), limit: 5 })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.recommendations.map((r) => r.product._id);
    // Keyboard and Plate are co-purchased by the similar buyer; Mouse/Mug owned.
    expect(ids).toContain(products[1]._id.toString());
    expect(ids).toContain(products[3]._id.toString());
    expect(ids).not.toContain(products[0]._id.toString());
    expect(ids).not.toContain(products[2]._id.toString());
    expect(res.body.recommendations[0].reason).toBe('collaborative');
  });

  it('a signed-in customer gets their own recommendations without customerId', async () => {
    const res = await request(app)
      .get('/api/recommendations')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(200);
    const ids = res.body.recommendations.map((r) => r.product._id);
    expect(ids).toContain(products[1]._id.toString());
  });

  it('falls back to popular for a customer with no history', async () => {
    const res = await request(app)
      .get('/api/recommendations')
      .query({ customerId: customers[2]._id.toString(), limit: 5 })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.recommendations.length).toBeGreaterThan(0);
    expect(res.body.recommendations[0].reason).toBe('popular');
  });

  it('GET /popular returns top sellers', async () => {
    const res = await request(app)
      .get('/api/recommendations/popular')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.recommendations.length).toBeGreaterThan(0);
    // Mouse was bought most (target twice + similar once) → top seller.
    expect(res.body.recommendations[0].product._id).toBe(products[0]._id.toString());
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/recommendations').query({ customerId: customers[0]._id.toString() });
    expect(res.status).toBe(401);
  });
});
