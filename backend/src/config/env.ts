import 'dotenv/config';
import { z } from 'zod';
import type { SignOptions } from 'jsonwebtoken';

// Helper type สำหรับบังคับ Type ของ StringValue/ExpiresIn ของ jsonwebtoken
const expiresInSchema = z
  .string()
  .min(1) as z.ZodType<NonNullable<SignOptions['expiresIn']>>;

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET must be at least 32 chars'),

  JWT_REFRESH_SECRET: z
    .string()
    .min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),

  JWT_ACCESS_EXPIRES_IN: expiresInSchema.default('15m'),
  JWT_REFRESH_EXPIRES_IN: expiresInSchema.default('30d'),

  FMP_API_KEY: z.string().min(1, 'FMP_API_KEY is required'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    '❌ Invalid environment variables:',
    parsed.error.flatten().fieldErrors,
  );
  process.exit(1);
}

export const env = parsed.data;