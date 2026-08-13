import { connectTestDb, makeCustomer } from './setup.js';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import Vendor from '../src/models/Vendor.js';
import Product from '../src/models/Product.js';
import Inventory from '../src/models/Inventory.js';
import Transaction from '../src/models/Transaction.js';
import Cart from '../src/models/Cart.js';
import Wishlist from '../src/models/Wishlist.js';

/**
 * Full cart→checkout→transactions integration test. Where cart.test.js and
 * wishlist.test.js cover each unit in isolation, this chains the entire
 * customer purchase lifecycle end-to-end against a single cart, asserting the
 * invariants that span endpoints:
 *   - add → merge → cap-at-stock
 *   - wishlist add (idempotent) → move-to-cart (adds to cart + removes from wishlist)
 *   - checkout is atomic: ALL items → Transaction rows, stock decremented, cart cleared
 *   - insufficient stock aborts the WHOLE order (no partial orders, no leakage)
 *   - empty-cart checkout rejected
 */

let app;
let token;
let customer;
let vendor;
let products;

beforeAll(async () => {
  await connectTestDb();
  app = createApp();

  vendor = new Vendor({ businessName: 'Flow Vendor', contactEmail: 'fv@flow.test', role: 'vendor', status: 'Active' });
  await vendor.setPassword('p');
  await vendor.save();

  products = await Product.create([
    { vendorId: vendor._id, name: 'Alpha', category: 'Electronics', price: 100, status: 'active' },
    { vendorId: vendor._id, name: 'Beta', category: 'Home', price: 50, status: 'active' },
    { vendorId: vendor._id, name: 'Gamma', category: 'Home', price: 25, status: 'active' }, // low stock (2)
  ]);
  await Inventory.create([
    { productId: products[0]._id, vendorId: vendor._id, stockAvailable: 5, reorderThreshold: 2 },
    { productId: products[1]._id, vendorId: vendor._id, stockAvailable: 10, reorderThreshold: 2 },
    { productId: products[2]._id, vendorId: vendor._id, stockAvailable: 2, reorderThreshold: 2 },
  ]);

  customer = await makeCustomer({ name: 'Flow Buyer', email: 'flow@cust.test', password: 'pw123456' });
  token = (await request(app).post('/api/auth/customer/login').send({ email: 'flow@cust.test', password: 'pw123456' })).body.token;
});

afterAll(async () => {
  await mongoose.disconnect();
});

const auth = (req) => req.set('Authorization', `Bearer ${token}`);

describe('Full cart → checkout → transactions lifecycle', () => {
  it('step 1: adds an item and lazily creates the cart', async () => {
    const res = await auth(request(app).post('/api/cart')).send({ productId: products[0]._id.toString(), quantity: 2 });
    expect(res.status).toBe(200);
    expect(res.body.cart.items).toHaveLength(1);
    expect(res.body.cart.items[0].quantity).toBe(2);
  });

  it('step 2: re-adding the same product merges quantity', async () => {
    const res = await auth(request(app).post('/api/cart')).send({ productId: products[0]._id.toString(), quantity: 2 });
    expect(res.body.cart.items[0].quantity).toBe(4);
  });

  it('step 3: quantity is capped at available stock (5)', async () => {
    const res = await auth(request(app).post('/api/cart')).send({ productId: products[0]._id.toString(), quantity: 99 });
    expect(res.body.cart.items[0].quantity).toBe(5);
  });

  it('step 4: adds a second, independent product', async () => {
    const res = await auth(request(app).post('/api/cart')).send({ productId: products[1]._id.toString(), quantity: 3 });
    expect(res.body.cart.items).toHaveLength(2);
  });

  it('step 5: wishlist add is idempotent', async () => {
    await auth(request(app).post(`/api/wishlist/${products[2]._id}`));
    const res = await auth(request(app).post(`/api/wishlist/${products[2]._id}`));
    expect(res.body.wishlist.items).toHaveLength(1);
  });

  it('step 6: move-to-cart adds to cart AND removes from wishlist in one round-trip', async () => {
    const res = await auth(request(app).post(`/api/wishlist/${products[2]._id}/move-to-cart`));
    expect(res.status).toBe(200);
    expect(res.body.wishlist.items).toHaveLength(0);
    expect(res.body.cart.items).toHaveLength(3);
    const gamma = res.body.cart.items.find((i) => i.productId.name === 'Gamma');
    expect(gamma.quantity).toBe(1);
  });

  it('step 7: checkout converts ALL cart items to transactions, decrements stock, clears cart', async () => {
    const beforeTxns = await Transaction.countDocuments({ customerId: customer._id });
    const res = await auth(request(app).post('/api/cart/checkout'));
    expect(res.status).toBe(201);
    expect(res.body.checkedOut).toBe(true);
    // 3 distinct products → 3 transaction rows created.
    expect(res.body.transactions.length).toBeGreaterThanOrEqual(3);

    const afterTxns = await Transaction.countDocuments({ customerId: customer._id });
    expect(afterTxns - beforeTxns).toBe(3);

    // Cart cleared.
    const cart = await auth(request(app).get('/api/cart'));
    expect(cart.body.cart.items).toHaveLength(0);

    // Stock decremented: Alpha 5→0, Beta 10→7, Gamma 2→1.
    const alphaInv = await Inventory.findOne({ productId: products[0]._id });
    const betaInv = await Inventory.findOne({ productId: products[1]._id });
    const gammaInv = await Inventory.findOne({ productId: products[2]._id });
    expect(alphaInv.stockAvailable).toBe(0);
    expect(betaInv.stockAvailable).toBe(7);
    expect(gammaInv.stockAvailable).toBe(1);

    // All new transactions are 'paid'.
    const newTxns = await Transaction.find({ customerId: customer._id }).sort('-date').limit(3);
    expect(newTxns.every((t) => t.status === 'paid')).toBe(true);
  });

  it('step 8: checkout aborts the WHOLE order on insufficient stock (no partial orders)', async () => {
    // Restock Alpha to 2, add it to the cart at full stock, then sabotage the
    // shelf below the cart quantity so the whole checkout must abort.
    await Inventory.updateOne({ productId: products[0]._id }, { $set: { stockAvailable: 2 } });
    await auth(request(app).delete('/api/cart')); // start from an empty cart
    await auth(request(app).post('/api/cart')).send({ productId: products[0]._id.toString(), quantity: 2 });
    await auth(request(app).post('/api/cart')).send({ productId: products[1]._id.toString(), quantity: 1 });

    // Sabotage: drop Alpha stock below the cart quantity (2 → 0) after it was added.
    await Inventory.updateOne({ productId: products[0]._id }, { $set: { stockAvailable: 0 } });

    const betaBefore = await Inventory.findOne({ productId: products[1]._id });
    const res = await auth(request(app).post('/api/cart/checkout'));
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Insufficient stock/i);

    // No leakage: Beta stock unchanged (checkout aborted, nothing committed).
    const betaAfter = await Inventory.findOne({ productId: products[1]._id });
    expect(betaAfter.stockAvailable).toBe(betaBefore.stockAvailable);

    // Cart NOT cleared (checkout failed).
    const cart = await auth(request(app).get('/api/cart'));
    expect(cart.body.cart.items.length).toBeGreaterThan(0);

    // Restore Alpha stock to 2 so later steps (checkout-independence) are sane.
    await Inventory.updateOne({ productId: products[0]._id }, { $set: { stockAvailable: 2 } });
  });

  it('step 9: rejects checkout of an empty cart', async () => {
    await auth(request(app).delete('/api/cart'));
    const res = await auth(request(app).post('/api/cart/checkout'));
    expect(res.status).toBe(400);
  });

  it('step 10: cart and wishlist are isolated per customer', async () => {
    const other = await makeCustomer({ name: 'Other Flow', email: 'otherflow@cust.test', password: 'pw123456' });
    const otherToken = (await request(app).post('/api/auth/customer/login').send({ email: 'otherflow@cust.test', password: 'pw123456' })).body.token;

    await request(app).post('/api/cart').set('Authorization', `Bearer ${otherToken}`).send({ productId: products[1]._id.toString(), quantity: 1 });

    const mine = await auth(request(app).get('/api/cart'));
    const theirs = await request(app).get('/api/cart').set('Authorization', `Bearer ${otherToken}`);
    expect(mine.body.cart.items).toHaveLength(0);
    expect(theirs.body.cart.items).toHaveLength(1);
  });
});
