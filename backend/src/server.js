import env from './config/env.js';
import { connectDb } from './config/db.js';
import app from './app.js';

async function start() {
  await connectDb();
  app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`ShopSense API running on http://localhost:${env.port} (${env.nodeEnv})`);
  });
}

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start server:', err);
  process.exit(1);
});

export default app;
