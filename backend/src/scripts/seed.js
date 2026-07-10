/**
 * Seed dev data: 1 admin + 2 demo vendors (one Active, one Pending),
 * sample categories, products with inventory, and sample transactions.
 *
 *   node src/scripts/seed.js
 *   node src/scripts/seed.js --reset   # drop collections first
 */
import { connectDb, disconnectDb } from '../config/db.js';
import env from '../config/env.js';
import Vendor from '../models/Vendor.js';
import Category from '../models/Category.js';
import Product from '../models/Product.js';
import Inventory from '../models/Inventory.js';
import Transaction from '../models/Transaction.js';

const args = new Set(process.argv.slice(2));
const reset = args.has('--reset');

async function seed() {
  await connectDb(env.mongoUri);

  if (reset) {
    await Promise.all([
      Vendor.deleteMany({}),
      Category.deleteMany({}),
      Product.deleteMany({}),
      Inventory.deleteMany({}),
      Transaction.deleteMany({}),
    ]);
    // eslint-disable-next-line no-console
    console.log('Cleared existing data.');
  }

  // --- admin ---
  const admin = new Vendor({
    businessName: 'ShopSense Admin',
    contactEmail: 'admin@shopsense.test',
    role: 'admin',
    status: 'Active',
    commissionRate: 0,
  });
  await admin.setPassword('admin123');
  await admin.save();

  // --- categories ---
  const categories = await Category.create([
    { name: 'Electronics', slug: 'electronics', commissionDefault: 8 },
    { name: 'Apparel', slug: 'apparel', commissionDefault: 10 },
    { name: 'Home & Kitchen', slug: 'home-kitchen', commissionDefault: 7 },
    { name: 'Books', slug: 'books', commissionDefault: 5 },
  ]);

  // --- Active vendor (approved, with products) ---
  const acme = new Vendor({
    businessName: 'Acme Traders',
    contactEmail: 'vendor@shopsense.test',
    phone: '+1-555-0100',
    role: 'vendor',
    status: 'Active',
    commissionRate: 8,
    businessDetails: { address: '12 Market St, SF', gstNumber: 'GSTIN001', description: 'Electronics & home goods' },
    categories: [categories[0]._id, categories[2]._id],
    verification: { submittedAt: new Date(), reviewedBy: admin._id, reviewedAt: new Date(), notes: 'Auto-approved by seed' },
  });
  await acme.setPassword('vendor123');
  await acme.save();

  // --- Pending vendor (awaiting approval) ---
  const beta = new Vendor({
    businessName: 'Beta Boutique',
    contactEmail: 'beta@shopsense.test',
    phone: '+1-555-0200',
    role: 'vendor',
    status: 'Pending',
    commissionRate: 10,
    businessDetails: { address: '8 Olive Rd, NY', gstNumber: 'GSTIN002', description: 'Apparel retailer' },
    categories: [categories[1]._id],
    verification: {
      documents: [{ name: 'GST Certificate', url: 'https://example.com/beta-gst.pdf' }],
      submittedAt: new Date(),
      notes: 'Awaiting review',
    },
  });
  await beta.setPassword('beta123');
  await beta.save();

  // --- products for Acme ---
  const products = await Product.create([
    { vendorId: acme._id, name: 'Wireless Mouse', sku: 'ACM-MS-01', category: 'Electronics', price: 19.99, description: 'Ergonomic 2.4GHz mouse' },
    { vendorId: acme._id, name: 'USB-C Hub', sku: 'ACM-HB-01', category: 'Electronics', price: 39.99, description: '7-in-1 USB-C adapter' },
    { vendorId: acme._id, name: 'Blender 1.5L', sku: 'ACM-BL-01', category: 'Home & Kitchen', price: 49.99, description: '600W glass jug blender' },
  ]);

  await Inventory.create([
    { productId: products[0]._id, vendorId: acme._id, stockAvailable: 120, reorderThreshold: 20 },
    { productId: products[1]._id, vendorId: acme._id, stockAvailable: 8, reorderThreshold: 15 }, // low stock
    { productId: products[2]._id, vendorId: acme._id, stockAvailable: 35, reorderThreshold: 10 },
  ]);

  // --- sample transactions (last ~30 days) for the analytics dashboard ---
  // Keep stock and revenue consistent: each sale decrements the inventory row.
  const invByProduct = {};
  const inventories = await Inventory.find({ vendorId: acme._id });
  for (const inv of inventories) invByProduct[inv.productId.toString()] = inv;

  const txSpecs = [
    { p: products[0], qty: 5 },
    { p: products[0], qty: 3 },
    { p: products[0], qty: 2 },
    { p: products[1], qty: 4 },
    { p: products[1], qty: 2 },
    { p: products[2], qty: 6 },
    { p: products[2], qty: 3 },
  ];

  const txDocs = [];
  const now = Date.now();
  txSpecs.forEach((spec, i) => {
    const unitPrice = spec.p.price;
    txDocs.push({
      productId: spec.p._id,
      vendorId: acme._id,
      quantity: spec.qty,
      unitPrice,
      totalAmount: unitPrice * spec.qty,
      status: 'paid',
      date: new Date(now - (txSpecs.length - i) * 3 * 24 * 60 * 60 * 1000),
    });
    const inv = invByProduct[spec.p._id.toString()];
    if (inv) inv.stockAvailable = Math.max(0, inv.stockAvailable - spec.qty);
  });

  const savedTx = await Transaction.create(txDocs);
  await Promise.all(inventories.map((inv) => inv.save()));

  // eslint-disable-next-line no-console
  console.log(`Seeded:
  admin        -> admin@shopsense.test / admin123
  vendor       -> vendor@shopsense.test / vendor123   (Active)
  pending      -> beta@shopsense.test   / beta123     (Pending)
  categories  -> ${categories.length}
  products    -> ${products.length} (1 low-stock)
  transactions -> ${savedTx.length}`);

  await disconnectDb();
}

seed().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Seed failed:', err);
  process.exit(1);
});
