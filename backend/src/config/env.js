import dotenv from 'dotenv';

dotenv.config();

const env = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/shopsense',
  jwtSecret: process.env.JWT_SECRET || 'dev_secret_change_me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
};

if (env.nodeEnv === 'production' && env.jwtSecret === 'dev_secret_change_me') {
  // eslint-disable-next-line no-console
  console.warn('WARNING: JWT_SECRET is not set in production');
}

export default env;
