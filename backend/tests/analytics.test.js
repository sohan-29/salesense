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

  const login = await request(app).post('/api/auth/login').send({
    contactEmail: 'admin@analytics.test',
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
