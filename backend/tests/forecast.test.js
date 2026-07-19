import { connectTestDb } from './setup.js';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import Vendor from '../src/models/Vendor.js';
import Product from '../src/models/Product.js';
import Inventory from '../src/models/Inventory.js';
import Transaction from '../src/models/Transaction.js';
import InventoryForecast from '../src/models/InventoryForecast.js';

const DAY = 24 * 60 * 60 * 1000;

let app;
let token;
let product;

beforeAll(async () => {
  await connectTestDb();
  app = createApp();

  const vendor = new Vendor({
    businessName: 'Forecast Vendor',
    contactEmail: 'fv@example.com',
    role: 'vendor',
    status: 'Active',
  });
  await vendor.setPassword('password123');
  await vendor.save();

  const login = await request(app).post('/api/auth/vendor/login').send({ email: 'fv@example.com', password: 'password123' });
  token = login.body.token;

  product = await Product.create({ vendorId: vendor._id, name: 'Forecast Widget', category: 'Electronics', price: 20 });
  await Inventory.create({ productId: product._id, vendorId: vendor._id, stockAvailable: 100, reorderThreshold: 5 });

  // 14 sales of 2 units each, one per day for the last 14 days -> avg 2/day.
  const now = Date.now();
  const docs = [];
  for (let i = 0; i < 14; i++) {
    docs.push({
      productId: product._id,
      vendorId: vendor._id,
      quantity: 2,
      unitPrice: 20,
      totalAmount: 40,
      status: 'paid',
      date: new Date(now - i * DAY),
    });
  }
  await Transaction.create(docs);
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe('GET /api/inventory/forecast — moving average', () => {
  it('predicts next-week demand from average daily sales', async () => {
    const res = await request(app)
      .get('/api/inventory/forecast')
      .query({ productId: product._id.toString(), days: 14, horizon: 7 })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const fc = res.body.forecasts[0];
    expect(fc.productId).toBe(product._id.toString());
    // 14 days × 2 units/day = 28 total -> avg 2/day -> 14 for a 7-day horizon.
    expect(fc.avgDailySales).toBeCloseTo(2, 1);
    expect(fc.predictedStock).toBeCloseTo(14, 1);
    expect(fc.confidenceLevel).toBeGreaterThan(0.5);
    expect(fc.method).toBe('moving-average');
  });

  it('scales the forecast with the horizon', async () => {
    const res = await request(app)
      .get('/api/inventory/forecast')
      .query({ productId: product._id.toString(), days: 14, horizon: 14 })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    // 2/day over 14 days = 28.
    expect(res.body.forecasts[0].predictedStock).toBeCloseTo(28, 1);
  });

  it('persists an InventoryForecast document', async () => {
    await request(app)
      .get('/api/inventory/forecast')
      .query({ productId: product._id.toString(), days: 14, horizon: 7 })
      .set('Authorization', `Bearer ${token}`);

    const stored = await InventoryForecast.findOne({ productId: product._id }).sort('-forecastDate');
    expect(stored).not.toBeNull();
    expect(stored.predictedStock).toBeCloseTo(14, 1);
    expect(stored.horizonDays).toBe(7);
  });

  it('forecasts all of the vendor’s products when no productId is given', async () => {
    const extra = await Product.create({ vendorId: product.vendorId, name: 'Other Widget', category: 'Electronics', price: 10 });
    await Inventory.create({ productId: extra._id, vendorId: product.vendorId, stockAvailable: 50, reorderThreshold: 5 });

    const res = await request(app)
      .get('/api/inventory/forecast')
      .query({ days: 14, horizon: 7 })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const ids = res.body.forecasts.map((f) => f.productId);
    expect(ids).toContain(product._id.toString());
    expect(ids).toContain(extra._id.toString());
  });

  it('returns 404 for an unknown product', async () => {
    const res = await request(app)
      .get('/api/inventory/forecast')
      .query({ productId: '000000000000000000000000' })
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/inventory/forecast');
    expect(res.status).toBe(401);
  });
});
