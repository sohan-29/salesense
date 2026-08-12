import { connectTestDb, makeCustomer } from './setup.js';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import Vendor from '../src/models/Vendor.js';
import Product from '../src/models/Product.js';
import Inventory from '../src/models/Inventory.js';
import Transaction from '../src/models/Transaction.js';
import Cart from '../src/models/Cart.js';

let app;
let customerToken;
let customer;
let otherToken;
let products;
let vendor;

beforeAll(async () => {
  await connectTestDb();
  app = createApp();

  vendor = new Vendor({ businessName: 'Cart Vendor', contactEmail: 'cv@cart.test', role: 'vendor', status: 'Active' });
  await vendor.setPassword('p');
  await vendor.save();

  // 3 products with stock levels chosen to test checkout + insufficient stock.
  products = await Product.create([
    { vendorId: vendor._id, name: 'Widget', category: 'Electronics', price: 100, status: 'active' },
    { vendorId: vendor._id, name: 'Gadget', category: 'Electronics', price: 50, status: 'active' },
    { vendorId: vendor._id, name: 'Rare', category: 'Home', price: 10, status: 'active' },
  ]);
  await Inventory.create([
    { productId: products[0]._id, vendorId: vendor._id, stockAvailable: 5, reorderThreshold: 2 },
    { productId: products[1]._id, vendorId: vendor._id, stockAvailable: 10, reorderThreshold: 2 },
    { productId: products[2]._id, vendorId: vendor._id, stockAvailable: 1, reorderThreshold: 2 }, // only 1 in stock
  ]);

  customer = await makeCustomer({ name: 'Cart Buyer', email: 'cart@cust.test', password: 'pw123456' });
  customerToken = (await request(app).post('/api/auth/customer/login').send({ email: 'cart@cust.test', password: 'pw123456' })).body.token;

  const other = await makeCustomer({ name: 'Other', email: 'other@cust.test', password: 'pw123456' });
  otherToken = (await request(app).post('/api/auth/customer/login').send({ email: 'other@cust.test', password: 'pw123456' })).body.token;
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe('Shopping cart', () => {
  it('adds an item to the cart (creates the cart lazily)', async () => {
    const res = await request(app)
      .post('/api/cart')
      .send({ productId: products[0]._id.toString(), quantity: 2 })
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.cart.items).toHaveLength(1);
    expect(res.body.cart.items[0].quantity).toBe(2);
    expect(res.body.cart.items[0].productId.name).toBe('Widget');
  });

  it('merges quantity when adding an item already in the cart', async () => {
    const res = await request(app)
      .post('/api/cart')
      .send({ productId: products[0]._id.toString(), quantity: 1 })
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.cart.items[0].quantity).toBe(3);
  });

  it('caps quantity at available stock', async () => {
    const res = await request(app)
      .post('/api/cart')
      .send({ productId: products[0]._id.toString(), quantity: 99 }) // validation max is 99
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.cart.items[0].quantity).toBe(5); // stockAvailable
  });

  it('updates quantity via PATCH (0 removes)', async () => {
    const add = await request(app)
      .post('/api/cart')
      .send({ productId: products[1]._id.toString(), quantity: 2 })
      .set('Authorization', `Bearer ${customerToken}`);
    expect(add.body.cart.items).toHaveLength(2);

    const res = await request(app)
      .patch(`/api/cart/${products[1]._id}`)
      .send({ quantity: 4 })
      .set('Authorization', `Bearer ${customerToken}`);
    const item = res.body.cart.items.find((i) => i.productId._id === products[1]._id.toString());
    expect(item.quantity).toBe(4);

    const rem = await request(app)
      .patch(`/api/cart/${products[1]._id}`)
      .send({ quantity: 0 })
      .set('Authorization', `Bearer ${customerToken}`);
    expect(rem.body.cart.items).toHaveLength(1);
  });

  it('isolates carts between customers', async () => {
    const mine = await request(app).get('/api/cart').set('Authorization', `Bearer ${customerToken}`);
    const theirs = await request(app).get('/api/cart').set('Authorization', `Bearer ${otherToken}`);
    expect(mine.body.cart.items).toHaveLength(1);
    expect(theirs.body.cart.items).toHaveLength(0);
  });

  it('checkout converts all cart items to transactions + decrements stock + clears cart', async () => {
    // Cart currently has Widget x5 (capped). Add Gadget x2.
    await request(app)
      .post('/api/cart')
      .send({ productId: products[1]._id.toString(), quantity: 2 })
      .set('Authorization', `Bearer ${customerToken}`);

    const res = await request(app)
      .post('/api/cart/checkout')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(201);
    expect(res.body.checkedOut).toBe(true);
    expect(res.body.transactions.length).toBeGreaterThanOrEqual(2);

    // Cart cleared.
    const cart = await request(app).get('/api/cart').set('Authorization', `Bearer ${customerToken}`);
    expect(cart.body.cart.items).toHaveLength(0);

    // Stock decremented: Widget 5→0, Gadget 10→8.
    const widgetInv = await Inventory.findOne({ productId: products[0]._id });
    const gadgetInv = await Inventory.findOne({ productId: products[1]._id });
    expect(widgetInv.stockAvailable).toBe(0);
    expect(gadgetInv.stockAvailable).toBe(8);

    // Transactions recorded against the customer.
    const txns = await Transaction.find({ customerId: customer._id });
    expect(txns.length).toBeGreaterThanOrEqual(2);
    expect(txns.every((t) => t.status === 'paid')).toBe(true);
  });

  it('checkout aborts the WHOLE order on insufficient stock (no partial orders)', async () => {
    // Start fresh: add two in-stock items (Widget restocked, Gadget in stock).
    await Inventory.updateOne({ productId: products[0]._id }, { $set: { stockAvailable: 3 } });
    await request(app).delete('/api/cart').set('Authorization', `Bearer ${customerToken}`);
    await request(app)
      .post('/api/cart')
      .send({ productId: products[0]._id.toString(), quantity: 2 })
      .set('Authorization', `Bearer ${customerToken}`);
    await request(app)
      .post('/api/cart')
      .send({ productId: products[1]._id.toString(), quantity: 1 })
      .set('Authorization', `Bearer ${customerToken}`);

    // Now sabotage: drop Widget stock below the cart quantity (2 > 0).
    await Inventory.updateOne({ productId: products[0]._id }, { $set: { stockAvailable: 0 } });

    const before = await Inventory.findOne({ productId: products[1]._id });
    const res = await request(app)
      .post('/api/cart/checkout')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Insufficient stock/i);

    // No stock leakage: Gadget stock unchanged (checkout aborted, nothing committed).
    const after = await Inventory.findOne({ productId: products[1]._id });
    expect(after.stockAvailable).toBe(before.stockAvailable);

    // Cart NOT cleared (checkout failed).
    const cart = await request(app).get('/api/cart').set('Authorization', `Bearer ${customerToken}`);
    expect(cart.body.cart.items.length).toBeGreaterThan(0);
  });

  it('rejects checkout of an empty cart', async () => {
    // Clear cart first.
    await request(app).delete('/api/cart').set('Authorization', `Bearer ${customerToken}`);
    const res = await request(app)
      .post('/api/cart/checkout')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(400);
  });
});
