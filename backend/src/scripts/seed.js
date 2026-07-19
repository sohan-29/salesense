/**
 * Seed dev data for Milestone 2: admin + 2 vendors, 4 categories, products
 * across categories, 8 customers with deliberate behavioural patterns, and
 * ~60 days of customer-attributed transactions so forecasting, segmentation,
 * recommendations, and backtesting all have meaningful data.
 *
 *   node src/scripts/seed.js
 *   node src/scripts/seed.js --reset   # drop collections first
 */
import { connectDb, disconnectDb } from '../config/db.js';
import env from '../config/env.js';
import Vendor from '../models/Vendor.js';
import Customer from '../models/Customer.js';
import Category from '../models/Category.js';
import Product from '../models/Product.js';
import Inventory from '../models/Inventory.js';
import Transaction from '../models/Transaction.js';
import InventoryForecast from '../models/InventoryForecast.js';

const args = new Set(process.argv.slice(2));
const reset = args.has('--reset');

const DAY = 24 * 60 * 60 * 1000;

async function seed() {
  await connectDb(env.mongoUri);

  if (reset) {
    await Promise.all([
      Vendor.deleteMany({}),
      Category.deleteMany({}),
      Product.deleteMany({}),
      Inventory.deleteMany({}),
      Transaction.deleteMany({}),
      Customer.deleteMany({}),
      InventoryForecast.deleteMany({}),
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

  // --- Active vendor (approved, with products across categories) ---
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

  // --- customers: 8 with deliberate behavioural patterns ---
  // Patterns are realised by the transaction spec below (recency/frequency).
  const customerSpecs = [
    { name: 'John Doe', email: 'customer@shopsense.test', phone: '+1-555-0300', address: '21 Elm St, Boston', pattern: 'frequent' },
    { name: 'Jane Smith', email: 'jane@shopsense.test', phone: '+1-555-0310', address: '5 Pine Ave, Austin', pattern: 'frequent' },
    { name: 'Aarav Patel', email: 'aarav@shopsense.test', phone: '+1-555-0320', address: '9 Hill Rd, Pune', pattern: 'occasional' },
    { name: 'Mia Wong', email: 'mia@shopsense.test', phone: '+1-555-0330', address: '2 Bay St, Seattle', pattern: 'occasional' },
    { name: 'Liam Brown', email: 'liam@shopsense.test', phone: '+1-555-0340', address: '18 Oak Ave, Dublin', pattern: 'atRisk' },
    { name: 'Noah Khan', email: 'noah@shopsense.test', phone: '+1-555-0350', address: '7 Lake Rd, Lahore', pattern: 'dormant' },
    { name: 'Emma Davis', email: 'emma@shopsense.test', phone: '+1-555-0360', address: '4 Park St, Bristol', pattern: 'new' },
    { name: 'Olivia Roy', email: 'olivia@shopsense.test', phone: '+1-555-0370', address: '6 River Rd, Lyon', pattern: 'new' },
  ];
  const customers = [];
  for (const c of customerSpecs) {
    const customer = new Customer(c);
    await customer.setPassword('customer123');
    await customer.save();
    customers.push(customer);
  }

  // --- products for Acme (Electronics + Home & Kitchen) ---
  const acmeProducts = await Product.create([
    { vendorId: acme._id, name: 'Wireless Mouse', sku: 'ACM-MS-01', category: 'Electronics', price: 19.99, description: 'Ergonomic 2.4GHz mouse' },
    { vendorId: acme._id, name: 'USB-C Hub', sku: 'ACM-HB-01', category: 'Electronics', price: 39.99, description: '7-in-1 USB-C adapter' },
    { vendorId: acme._id, name: 'Mechanical Keyboard', sku: 'ACM-KB-01', category: 'Electronics', price: 69.99, description: 'Hot-swap tactile switch keyboard' },
    { vendorId: acme._id, name: 'Blender 1.5L', sku: 'ACM-BL-01', category: 'Home & Kitchen', price: 49.99, description: '600W glass jug blender' },
    { vendorId: acme._id, name: 'Air Fryer', sku: 'ACM-AF-01', category: 'Home & Kitchen', price: 89.99, description: '5L digital air fryer' },
  ]);

  // Beta is Pending so cannot list products yet; give one anyway for catalogue
  // breadth (admin-curated). Kept minimal to honour the Pending lifecycle.
  const betaProducts = await Product.create([
    { vendorId: beta._id, name: 'Cotton T-Shirt', sku: 'BTA-TS-01', category: 'Apparel', price: 14.99, description: 'Organic cotton tee' },
  ]);

  const allProducts = [...acmeProducts, ...betaProducts];

  // Inventory: generous stock so seeded sales don't deplete below zero.
  await Inventory.create([
    { productId: acmeProducts[0]._id, vendorId: acme._id, stockAvailable: 300, reorderThreshold: 20 },
    { productId: acmeProducts[1]._id, vendorId: acme._id, stockAvailable: 8, reorderThreshold: 15 }, // low stock
    { productId: acmeProducts[2]._id, vendorId: acme._id, stockAvailable: 120, reorderThreshold: 15 },
    { productId: acmeProducts[3]._id, vendorId: acme._id, stockAvailable: 200, reorderThreshold: 10 },
    { productId: acmeProducts[4]._id, vendorId: acme._id, stockAvailable: 150, reorderThreshold: 12 },
    { productId: betaProducts[0]._id, vendorId: beta._id, stockAvailable: 400, reorderThreshold: 20 },
  ]);

  // --- historical transactions (~60 days), customer-attributed ---
  // Build a realistic matrix: each customer has a "taste" (preferred products)
  // so collaborative filtering finds co-purchase signal, and recency/frequency
  // realise each behavioural pattern.
  const now = Date.now();
  const invByProduct = {};
  const inventories = await Inventory.find({});
  for (const inv of inventories) invByProduct[inv.productId.toString()] = inv;

  // Map pattern -> generator returning { daysAgo, product } or null when done.
  const productByCat = (cat) => allProducts.filter((p) => p.category === cat);
  const electronics = productByCat('Electronics');
  const home = productByCat('Home & Kitchen');
  const apparel = [betaProducts[0]];

  // Each customer's preferred products (creates co-purchase overlap).
  const taste = {
    frequent: [electronics[0], electronics[1], home[0]],
    occasional: [electronics[0], home[1]],
    atRisk: [electronics[2], home[0]],
    dormant: [electronics[0], apparel[0]],
    new: [electronics[0], home[0]],
  };

  // Build the explicit transaction plan. Each entry: { customerIdx, product, daysAgo, qty }.
  const plan = [];
  const add = (ci, product, daysAgo, qty = 1) => plan.push({ ci, product, daysAgo, qty });

  // Frequent buyers: ≥3 orders in last 30d. Ownership is kept deliberately
  // partial so CF has signal (buyer 0 = {Mouse, USB-C Hub}, buyer 1 = {Mouse,
  // Blender}); the steady layer below supplies the daily volume. A couple of
  // extra recent orders reinforce the frequency without adding new products.
  add(0, electronics[0], 4, 1);
  add(0, electronics[1], 8, 1);
  add(1, electronics[0], 5, 1);
  add(1, home[0], 9, 1);

  // Occasional: a few orders, last within 30d but <3.
  [2, 3].forEach((ci) => {
    const tasteSet = taste.occasional;
    add(ci, tasteSet[0], 20, 1);
    add(ci, tasteSet[1], 45, 1);
    add(ci, tasteSet[0], 9, 1);
  });

  // At-risk: last purchase 30–60 days ago.
  [4].forEach((ci) => {
    const tasteSet = taste.atRisk;
    add(ci, tasteSet[0], 40, 1);
    add(ci, tasteSet[1], 52, 2);
  });

  // Dormant: had purchases, but none in last 60 days.
  [5].forEach((ci) => {
    const tasteSet = taste.dormant;
    add(ci, tasteSet[0], 75, 1);
    add(ci, tasteSet[1], 90, 1);
  });

  // New: joined recently (createdAt within 30d), <3 orders.
  [6, 7].forEach((ci) => {
    const tasteSet = taste.new;
    add(ci, tasteSet[0], 5, 1);
    add(ci, tasteSet[1], 14, 1);
  });

  // Steady daily demand layer (days 59..3): consistent daily sales on the core
  // Electronics products so the moving-average forecast has a clean signal,
  // AND a partial-overlap co-purchase graph for collaborative filtering:
  //   buyer 0 owns {Mouse, USB-C Hub}, buyer 1 owns {Mouse, Blender}
  //   (overlap on Mouse) → CF can recommend USB-C Hub→buyer1 and Blender→buyer0.
  for (let d = 59; d >= 3; d--) {
    add(0, electronics[0], d, 2); // buyer 0 → Mouse
    add(0, electronics[1], d, 1); // buyer 0 → USB-C Hub
    add(1, electronics[0], d, 1); // buyer 1 → Mouse (overlap)
    add(1, home[0], d, 1);        // buyer 1 → Blender
  }
  // Held-out "new product" purchases (day 1, strictly most recent for each
  // frequent buyer): buyer 0 buys Blender (not owned in train), buyer 1 buys
  // USB-C Hub (not owned in train). CF must recommend each → exact-product hit.
  add(0, home[0], 1, 1);
  add(1, electronics[1], 1, 1);

  // Sort by daysAgo descending (oldest first) for a natural chronological write.
  plan.sort((a, b) => b.daysAgo - a.daysAgo);

  // Backdate createdAt via the native collection (Mongoose timestamps would
  // otherwise keep createdAt at insert time). New joined recently; dormant/
  // at-risk/occasional joined long ago so the segment rules hold.
  const setCreatedAt = async (customer, daysAgo) => {
    const when = new Date(now - daysAgo * DAY);
    await Customer.collection.updateOne(
      { _id: customer._id },
      { $set: { createdAt: when, updatedAt: when } }
    );
  };
  await setCreatedAt(customers[6], 20); // new
  await setCreatedAt(customers[7], 20); // new
  await setCreatedAt(customers[5], 120); // dormant
  await setCreatedAt(customers[4], 100); // at-risk
  await setCreatedAt(customers[2], 90); // occasional
  await setCreatedAt(customers[3], 90); // occasional

  const txDocs = plan.map((p) => {
    const unitPrice = p.product.price;
    const totalAmount = unitPrice * p.qty;
    const inv = invByProduct[p.product._id.toString()];
    if (inv) inv.stockAvailable = Math.max(0, inv.stockAvailable - p.qty);
    return {
      productId: p.product._id,
      vendorId: p.product.vendorId,
      customerId: customers[p.ci]._id,
      quantity: p.qty,
      unitPrice,
      totalAmount,
      status: 'paid',
      date: new Date(now - p.daysAgo * DAY),
    };
  });

  const savedTx = await Transaction.create(txDocs);
  await Promise.all(inventories.map((inv) => inv.save()));

  // eslint-disable-next-line no-console
  console.log(`Seeded:
  admin        -> admin@shopsense.test / admin123
  vendor       -> vendor@shopsense.test / vendor123   (Active)
  pending      -> beta@shopsense.test   / beta123     (Pending)
  customer     -> customer@shopsense.test / customer123  (and 7 more, all /customer123)
  categories  -> ${categories.length}
  products    -> ${allProducts.length} (1 low-stock)
  customers   -> ${customers.length} (2 frequent, 2 occasional, 1 atRisk, 1 dormant, 2 new)
  transactions -> ${savedTx.length} (customer-attributed, ~60 days)`);

  await disconnectDb();
}

seed().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Seed failed:', err);
  process.exit(1);
});
