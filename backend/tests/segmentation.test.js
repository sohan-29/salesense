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
let products;
let customers;

beforeAll(async () => {
  await connectTestDb();
  app = createApp();

  const admin = new Vendor({ businessName: 'Admin', contactEmail: 'admin@seg.test', role: 'admin', status: 'Active' });
  await admin.setPassword('adminpass');
  await admin.save();
  adminToken = (await request(app).post('/api/auth/admin/login').send({ email: 'admin@seg.test', password: 'adminpass' })).body.token;

  const vendor = new Vendor({ businessName: 'V', contactEmail: 'v@seg.test', role: 'vendor', status: 'Active' });
  await vendor.setPassword('p');
  await vendor.save();

  products = await Product.create([
    { vendorId: vendor._id, name: 'A', category: 'Electronics', price: 10 },
    { vendorId: vendor._id, name: 'B', category: 'Home', price: 20 },
  ]);

  // Customers with deliberate patterns.
  customers = await Promise.all([
    makeCustomer({ name: 'Freq', email: 'freq@seg.test' }), // frequent: ≥3 orders last 30d
    makeCustomer({ name: 'Occ', email: 'occ@seg.test' }), // occasional
    makeCustomer({ name: 'Risk', email: 'risk@seg.test' }), // at-risk: last purchase 30-60d ago
    makeCustomer({ name: 'Dorm', email: 'dorm@seg.test' }), // dormant: none in 60d
    makeCustomer({ name: 'New', email: 'new@seg.test' }), // new: joined ≤30d, <3 orders
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

  // Backdate join dates so each behavioural segment holds.
  await backdate(Customer, customers[1]._id, 90); // occasional joined long ago
  await backdate(Customer, customers[3]._id, 120); // dormant joined long ago
  await backdate(Customer, customers[4]._id, 10); // new joined recently

  await Transaction.create([
    // frequent: 3 recent orders
    tx(customers[0]._id, products[0]._id, 2),
    tx(customers[0]._id, products[1]._id, 6),
    tx(customers[0]._id, products[0]._id, 12),
    tx(customers[0]._id, products[1]._id, 50),
    // occasional: 1 recent, 1 old
    tx(customers[1]._id, products[0]._id, 9),
    tx(customers[1]._id, products[1]._id, 40),
    // at-risk: last purchase 45 days ago
    tx(customers[2]._id, products[0]._id, 45),
    tx(customers[2]._id, products[1]._id, 55),
    // dormant: last purchase 80 days ago
    tx(customers[3]._id, products[0]._id, 80),
    // new: 1 recent order, joined 10d ago
    tx(customers[4]._id, products[0]._id, 5),
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe('GET /api/customers/segments', () => {
  it('buckets customers by recency/frequency', async () => {
    const res = await request(app).get('/api/customers/segments').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const byEmail = (seg) => res.body.segments[seg].map((c) => c.email);
    expect(byEmail('frequentBuyers')).toContain('freq@seg.test');
    expect(byEmail('dormantUsers')).toContain('dorm@seg.test');
    expect(byEmail('atRisk')).toContain('risk@seg.test');
    expect(byEmail('newUsers')).toContain('new@seg.test');
    // occasional is the residual bucket.
    expect(res.body.segments.occasional.map((c) => c.email)).toContain('occ@seg.test');
  });

  it('reports segment counts in the summary', async () => {
    const res = await request(app).get('/api/customers/segments').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.summary.total).toBe(5);
    expect(res.body.summary.counts.frequentBuyers).toBe(1);
    expect(res.body.summary.counts.dormantUsers).toBe(1);
  });

  it('requires admin', async () => {
    const res = await request(app).get('/api/customers/segments');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/customers/:id/behaviour', () => {
  it('returns purchase history, totals, and favourite category', async () => {
    const res = await request(app)
      .get(`/api/customers/${customers[0]._id}/behaviour`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const b = res.body.behaviour;
    expect(b.orderCount).toBe(4);
    expect(b.totalSpend).toBeGreaterThan(0);
    expect(b.favouriteCategory).toBeTruthy();
    expect(Array.isArray(b.history)).toBe(true);
    expect(b.history.length).toBe(4);
  });

  it('returns 404 for an unknown customer', async () => {
    const res = await request(app)
      .get('/api/customers/000000000000000000000000/behaviour')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});
