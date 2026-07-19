import mongoose from 'mongoose';
import Customer from '../src/models/Customer.js';

/**
 * Per-file test helper. Connect to the in-memory Mongo provisioned by
 * globalSetup (MONGO_URI_TEST) and start from a clean database.
 */
export async function connectTestDb() {
  const uri = process.env.MONGO_URI_TEST;
  if (!uri) throw new Error('MONGO_URI_TEST not set');
  mongoose.set('strictQuery', true);
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri);
  }
  await mongoose.connection.db.dropDatabase();
}

/**
 * Create a customer with a password (the schema requires passwordHash, so the
 * raw Customer.create() shortcut can't be used). Returns the saved customer.
 */
export async function makeCustomer({ password = 'customer123', ...fields }) {
  const customer = new Customer(fields);
  await customer.setPassword(password);
  await customer.save();
  return customer;
}

/**
 * Backdate a document's createdAt/updatedAt. Bypasses Mongoose's timestamps
 * middleware (which would otherwise keep createdAt at the insert time) by
 * writing through the native collection.
 */
export async function backdate(model, id, daysAgo) {
  const when = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  await model.collection.updateOne(
    { _id: typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id },
    { $set: { createdAt: when, updatedAt: when } }
  );
}

