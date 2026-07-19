import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import env from './config/env.js';
import authRoutes from './routes/authRoutes.js';
import vendorRoutes from './routes/vendorRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import productRoutes from './routes/productRoutes.js';
import inventoryRoutes from './routes/inventoryRoutes.js';
import transactionRoutes from './routes/transactionRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import recommendationRoutes from './routes/recommendationRoutes.js';
import notFound from './middleware/notFound.js';
import errorHandler from './middleware/errorHandler.js';

/**
 * Express app factory. Kept separate from server.js so tests can import the
 * app without binding a port.
 */
export function createApp() {
  const app = express();

  app.use(helmet());
  // Allow the configured frontend plus the common Vite dev ports (5173/5174),
  // since Vite falls back to the next free port if 5173 is taken.
  const allowedOrigins = new Set([
    env.clientUrl,
    'http://localhost:5173',
    'http://localhost:5174',
  ]);
  app.use(cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.has(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  }));
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  // Disable ETag/304 for API responses: dynamic JSON must always return a body,
  // otherwise axios parses an empty 304 and the client loses data (e.g. /auth/me).
  app.disable('etag');
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
  app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 1000, standardHeaders: true }));

  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'shopsense-api', time: new Date().toISOString() }));

  app.use('/api/auth', authRoutes);
  app.use('/api/vendors', vendorRoutes);
  app.use('/api/customers', customerRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/inventory', inventoryRoutes);
  app.use('/api/transactions', transactionRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/categories', categoryRoutes);
  app.use('/api/recommendations', recommendationRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

export default createApp();
