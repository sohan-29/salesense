import mongoose from 'mongoose';

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
