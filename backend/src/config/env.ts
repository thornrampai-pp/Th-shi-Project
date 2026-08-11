import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '4000', 10),
  DATABASE_URL: process.env.DATABASE_URL || '',
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || 'super-secret-key-change-in-prod',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'super-secret-key-change-in-prod',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  FMP_API_KEY: process.env.FMP_API_KEY || '',
  PYTHON_PATH: process.env.PYTHON_PATH || 'python3',
};

if (!env.DATABASE_URL) {
  console.warn('⚠️ WARNING: DATABASE_URL is not defined in environment variables.');
}