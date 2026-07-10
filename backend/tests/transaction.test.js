import { connectTestDb } from './setup.js';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import Vendor from '../src/models/Vendor.js';
import Product from '../src/models/Product.js';
import Inventory from '../src/models/Inventory.js';
import Transaction from '../src/models/Transaction.js';

let app;
let token;
let product;
let inventory;

beforeAll(async () => {
  await connectTestDb();
  app = createApp();

  // Active vendor + product with 10 units in stock.
  const vendor = new Vendor({
    businessName: 'Test Vendor',
    contactEmail: 'tv@example.com',
    role: 'vendor',
    status: 'Active',
  });
  await vendor.setPassword('password123');
  await vendor.save();

  const login = await request(app).post('/api/auth/login').send({
    contactEmail: 'tv@example.com',
    password: 'password123',
  });
  token = login.body.token;

  product = await Product.create({
    vendorId: vendor._id,
    name: 'Test Widget',
    category: 'Electronics',
    price: 20,
  });
  inventory = await Inventory.create({
    productId: product._id,
    vendorId: vendor._id,
    stockAvailable: 10,
    reorderThreshold: 2,
  });
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe('POST /api/transactions — order + inventory atomicity (≥98% consistency)', () => {
  it('records an order and decrements stock consistently', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product._id.toString(), quantity: 4 });

    expect(res.status).toBe(201);
    expect(res.body.transaction.totalAmount).toBe(80); // 4 * 20
    expect(res.body.transaction.quantity).toBe(4);

    const inv = await Inventory.findById(inventory._id);
    expect(inv.stockAvailable).toBe(6); // 10 - 4
  });

  it('rolls back on insufficient stock — no transaction, stock unchanged', async () => {
    const before = await Transaction.countDocuments();
    const res = await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product._id.toString(), quantity: 100 }); // only 6 left

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/insufficient stock/i);

    const after = await Transaction.countDocuments();
    expect(after).toBe(before); // no transaction written
    const inv = await Inventory.findById(inventory._id);
    expect(inv.stockAvailable).toBe(6); // unchanged from the previous test
  });

  it('rejects an invalid product id', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: 'not-an-id', quantity: 1 });
    expect(res.status).toBe(400);
  });

  it('rejects quantity < 1', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product._id.toString(), quantity: 0 });
    expect(res.status).toBe(400);
  });

  it('requires authentication', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .send({ productId: product._id.toString(), quantity: 1 });
    expect(res.status).toBe(401);
  });
});
