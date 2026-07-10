/**
 * Jest globalTeardown: stop the in-memory MongoDB started in globalSetup.
 * We only own the server when we provisioned it (i.e. MONGO_URI_TEST was not
 * pre-set by CI).
 */
export default async function globalTeardown() {
  if (global.__MONGOD) {
    await global.__MONGOD.stop();
    global.__MONGOD = null;
  }
}
