import { connectTestDb } from './setup.js';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import Vendor from '../src/models/Vendor.js';
import Product from '../src/models/Product.js';
import Inventory from '../src/models/Inventory.js';

let app;
let adminToken;
let vendorA;
let vendorAToken;
let vendorB;
let vendorBToken;

beforeAll(async () => {
  await connectTestDb();
  app = createApp();

  const admin = new Vendor({ businessName: 'Admin', contactEmail: 'admin@prod.test', role: 'admin', status: 'Active' });
  await admin.setPassword('adminpass');
  await admin.save();
  adminToken = (await request(app).post('/api/auth/admin/login').send({ email: 'admin@prod.test', password: 'adminpass' })).body.token;

  vendorA = new Vendor({ businessName: 'Vendor A', contactEmail: 'a@prod.test', role: 'vendor', status: 'Active' });
  await vendorA.setPassword('pass123');
  await vendorA.save();
  vendorAToken = (await request(app).post('/api/auth/vendor/login').send({ email: 'a@prod.test', password: 'pass123' })).body.token;

  vendorB = new Vendor({ businessName: 'Vendor B', contactEmail: 'b@prod.test', role: 'vendor', status: 'Active' });
  await vendorB.setPassword('pass123');
  await vendorB.save();
  vendorBToken = (await request(app).post('/api/auth/vendor/login').send({ email: 'b@prod.test', password: 'pass123' })).body.token;
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe('POST /api/products — create + auto-inventory', () => {
  let created;

  it('a vendor creates a product with stock → auto-creates an inventory row', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${vendorAToken}`)
      .send({ name: 'Test Widget', category: 'Electronics', price: 42, stock: 10, reorderThreshold: 3 });

    expect(res.status).toBe(201);
    created = res.body.product;
    expect(created.vendorId).toBe(vendorA._id.toString());
    expect(created.name).toBe('Test Widget');

    const inv = await Inventory.findOne({ productId: created._id });
    expect(inv).not.toBeNull();
    expect(inv.stockAvailable).toBe(10);
    expect(inv.reorderThreshold).toBe(3);
    expect(inv.vendorId.toString()).toBe(vendorA._id.toString());
  });

  it('a customer cannot create a product (403)', async () => {
    const reg = await request(app).post('/api/auth/customer/register').send({ name: 'Carol', email: 'carol@prod.test', password: 'secret123' });
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${reg.body.token}`)
      .send({ name: 'Nope', price: 1 });
    expect(res.status).toBe(403);
  });

  it('an admin cannot create a product (403 — creation is vendor-only)', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'AdminCreated', price: 5 });
    expect(res.status).toBe(403);
  });

  it('rejects a missing name with 400', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${vendorAToken}`)
      .send({ price: 10 });
    expect(res.status).toBe(400);
  });

  it('rejects a negative price with 400', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${vendorAToken}`)
      .send({ name: 'Neg', price: -5 });
    expect(res.status).toBe(400);
  });

  it('a vendor sees only their own products in the list', async () => {
    await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${vendorBToken}`)
      .send({ name: 'Vendor B Widget', category: 'Home', price: 20, stock: 4 });

    const res = await request(app).get('/api/products').set('Authorization', `Bearer ${vendorAToken}`);
    expect(res.status).toBe(200);
    const names = res.body.products.map((p) => p.name);
    expect(names).toContain('Test Widget');
    expect(names).not.toContain('Vendor B Widget');
  });

  it('an admin sees every vendor’s products', async () => {
    const res = await request(app).get('/api/products').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const names = res.body.products.map((p) => p.name);
    expect(names).toContain('Test Widget');
    expect(names).toContain('Vendor B Widget');
  });
});

describe('Product update/delete — ownership guards', () => {
  let pA;

  beforeAll(async () => {
    pA = (await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${vendorAToken}`)
      .send({ name: 'OwnedByA', price: 30, stock: 7 })).body.product;
  });

  it('the owner can update their product', async () => {
    const res = await request(app)
      .put(`/api/products/${pA._id}`)
      .set('Authorization', `Bearer ${vendorAToken}`)
      .send({ price: 35, category: 'Gadgets' });
    expect(res.status).toBe(200);
    expect(res.body.product.price).toBe(35);
    expect(res.body.product.category).toBe('Gadgets');
  });

  it('vendor B cannot update vendor A’s product (403)', async () => {
    const res = await request(app)
      .put(`/api/products/${pA._id}`)
      .set('Authorization', `Bearer ${vendorBToken}`)
      .send({ price: 999 });
    expect(res.status).toBe(403);
  });

  it('vendor B cannot delete vendor A’s product (403)', async () => {
    const res = await request(app)
      .delete(`/api/products/${pA._id}`)
      .set('Authorization', `Bearer ${vendorBToken}`);
    expect(res.status).toBe(403);
  });

  it('admin can update any vendor’s product', async () => {
    const res = await request(app)
      .put(`/api/products/${pA._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ description: 'Admin annotated' });
    expect(res.status).toBe(200);
    expect(res.body.product.description).toBe('Admin annotated');
  });

  it('get on an unknown product returns 404', async () => {
    const res = await request(app)
      .get('/api/products/000000000000000000000000')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it('delete removes the product and its inventory row', async () => {
    const res = await request(app)
      .delete(`/api/products/${pA._id}`)
      .set('Authorization', `Bearer ${vendorAToken}`);
    expect(res.status).toBe(200);

    expect(await Product.findById(pA._id)).toBeNull();
    expect(await Inventory.findOne({ productId: pA._id })).toBeNull();
  });
});

describe('Inventory — restock + low-stock', () => {
  let productLow;
  let productOk;

  beforeAll(async () => {
    productLow = (await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${vendorAToken}`)
      .send({ name: 'LowStockItem', price: 10, stock: 2, reorderThreshold: 5 })).body.product;
    productOk = (await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${vendorAToken}`)
      .send({ name: 'HealthyItem', price: 10, stock: 50, reorderThreshold: 5 })).body.product;
  });

  it('restock updates the stock level', async () => {
    const res = await request(app)
      .patch(`/api/inventory/${productOk._id}`)
      .set('Authorization', `Bearer ${vendorAToken}`)
      .send({ stockAvailable: 37 });
    expect(res.status).toBe(200);
    expect(res.body.inventory.stockAvailable).toBe(37);
  });

  it('a restock including reorderThreshold updates both fields', async () => {
    const res = await request(app)
      .patch(`/api/inventory/${productLow._id}`)
      .set('Authorization', `Bearer ${vendorAToken}`)
      .send({ stockAvailable: 2, reorderThreshold: 5 });
    expect(res.status).toBe(200);
    expect(res.body.inventory.reorderThreshold).toBe(5);
  });

  it('vendor B cannot restock vendor A’s inventory (403)', async () => {
    const res = await request(app)
      .patch(`/api/inventory/${productOk._id}`)
      .set('Authorization', `Bearer ${vendorBToken}`)
      .send({ stockAvailable: 0 });
    expect(res.status).toBe(403);
  });

  it('low-stock lists vendor A’s LowStockItem at the vendor’s own reorder threshold', async () => {
    const res = await request(app).get('/api/inventory/low-stock').set('Authorization', `Bearer ${vendorAToken}`);
    expect(res.status).toBe(200);
    const names = res.body.inventory.map((i) => i.product.name);
    // LowStockItem: stock 2 ≤ reorderThreshold 5 → present.
    // HealthyItem: stock 50 (later updated to 37) > reorderThreshold 5 → absent.
    expect(names).toContain('LowStockItem');
    expect(names).not.toContain('HealthyItem');
  });

  it('low-stock honours an explicit threshold override', async () => {
    // threshold=40 → HealthyItem (37 after restock) is now also low.
    const res = await request(app).get('/api/inventory/low-stock').query({ threshold: 40 }).set('Authorization', `Bearer ${vendorAToken}`);
    const names = res.body.inventory.map((i) => i.product.name);
    expect(names).toContain('HealthyItem');
    expect(names).toContain('LowStockItem');
  });

  it('restock of an unknown product returns 404', async () => {
    const res = await request(app)
      .patch('/api/inventory/000000000000000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ stockAvailable: 5 });
    expect(res.status).toBe(404);
  });
});
