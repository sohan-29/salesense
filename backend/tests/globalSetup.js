import { MongoMemoryReplSet } from 'mongodb-memory-server';

/**
 * Jest globalSetup: provision an in-memory MongoDB REPLICA SET once for the
 * whole run. A replica set (not a standalone) is required because the
 * transaction controller uses multi-document transactions
 * (session.withTransaction), which only work on a replica set or mongos.
 *
 * If MONGO_URI_TEST is already set (e.g. CI pointing at a real Mongo), skip
 * provisioning.
 */
export default async function globalSetup() {
  if (process.env.MONGO_URI_TEST) return; // reuse an externally-provided Mongo
  const replSet = await MongoMemoryReplSet.create({ instanceOpts: [{ port: 0 }], replSet: 'rs0' });
  process.env.MONGO_URI_TEST = replSet.getUri();
  global.__MONGOD = replSet; // available to globalTeardown
}
