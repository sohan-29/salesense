import mongoose from 'mongoose';
import env from './env.js';

/**
 * Connect to MongoDB. Called once at boot.
 * In test mode the caller supplies an in-memory Mongo URI.
 */
export async function connectDb(uri = env.mongoUri) {
  mongoose.set('strictQuery', true);
  const conn = await mongoose.connect(uri);
  // eslint-disable-next-line no-console
  console.log(`MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
  return conn;
}

export async function disconnectDb() {
  await mongoose.disconnect();
}
