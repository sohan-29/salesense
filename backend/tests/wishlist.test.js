import { connectTestDb, makeCustomer } from './setup.js';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import Vendor from '../src/models/Vendor.js';
import Product from '../src/models/Product.js';
import Inventory from '../src/models/Inventory.js';

let app;
let customerToken;
let products;
let vendor;

beforeAll(async () => {
  await connectTestDb();
  app = createApp();

  vendor = new Vendor({ businessName: 'Wish Vendor', contactEmail: 'wv@wish.test', role: 'vendor', status: 'Active' });
  await vendor.setPassword('p');
  await vendor.save();

  products = await Product.create([
    { vendorId: vendor._id, name: 'WishA', category: 'Electronics', price: 100, status: 'active' },
    { vendorId: vendor._id, name: 'WishB', category: 'Home', price: 50, status: 'active' },
  ]);
  await Inventory.create([
    { productId: products[0]._id, vendorId: vendor._id, stockAvailable: 5, reorderThreshold: 2 },
    { productId: products[1]._id, vendorId: vendor._id, stockAvailable: 5, reorderThreshold: 2 },
  ]);

  const customer = await makeCustomer({ name: 'Wisher', email: 'wish@cust.test', password: 'pw123456' });
  customerToken = (await request(app).post('/api/auth/customer/login').send({ email: 'wish@cust.test', password: 'pw123456' })).body.token;
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe('Wishlist', () => {
  it('adds a product to the wishlist (creates it lazily)', async () => {
    const res = await request(app)
      .post(`/api/wishlist/${products[0]._id}`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.wishlist.items).toHaveLength(1);
    expect(res.body.wishlist.items[0].productId.name).toBe('WishA');
  });

  it('is idempotent — adding the same product twice does not duplicate', async () => {
    const res = await request(app)
      .post(`/api/wishlist/${products[0]._id}`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.body.wishlist.items).toHaveLength(1);
  });

  it('adds a second product', async () => {
    const res = await request(app)
      .post(`/api/wishlist/${products[1]._id}`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.body.wishlist.items).toHaveLength(2);
  });

  it('removes a product from the wishlist', async () => {
    const res = await request(app)
      .delete(`/api/wishlist/${products[0]._id}`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.body.wishlist.items).toHaveLength(1);
    expect(res.body.wishlist.items[0].productId.name).toBe('WishB');
  });

  it('move-to-cart adds to cart + removes from wishlist', async () => {
    // Wishlist has WishB. Move it to cart.
    const res = await request(app)
      .post(`/api/wishlist/${products[1]._id}/move-to-cart`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.wishlist.items).toHaveLength(0);
    expect(res.body.cart.items).toHaveLength(1);
    expect(res.body.cart.items[0].productId.name).toBe('WishB');
    expect(res.body.cart.items[0].quantity).toBe(1);
  });

  it('isolates wishlists between customers', async () => {
    const other = await makeCustomer({ name: 'Other2', email: 'other2@cust.test', password: 'pw123456' });
    const otherToken = (await request(app).post('/api/auth/customer/login').send({ email: 'other2@cust.test', password: 'pw123456' })).body.token;

    await request(app).post(`/api/wishlist/${products[0]._id}`).set('Authorization', `Bearer ${otherToken}`);

    const mine = await request(app).get('/api/wishlist').set('Authorization', `Bearer ${customerToken}`);
    const theirs = await request(app).get('/api/wishlist').set('Authorization', `Bearer ${otherToken}`);
    expect(mine.body.wishlist.items).toHaveLength(0);
    expect(theirs.body.wishlist.items).toHaveLength(1);
  });
});
