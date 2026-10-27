import "dotenv/config";
import { z } from "zod";
import type { SignOptions } from "jsonwebtoken";

// Helper type สำหรับบังคับ Type ของ StringValue/ExpiresIn ของ jsonwebtoken
const expiresInSchema = z.string().min(1) as z.ZodType<
  NonNullable<SignOptions["expiresIn"]>
>;

// Empty strings in .env (e.g. `GEMINI_API_KEY=`) are treated as "not set".
const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().optional(),
);

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(4000),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),

  JWT_ACCESS_SECRET: z
    .string()
    .min(32, "JWT_ACCESS_SECRET must be at least 32 chars"),

  JWT_REFRESH_SECRET: z
    .string()
    .min(32, "JWT_REFRESH_SECRET must be at least 32 chars"),

  JWT_ACCESS_EXPIRES_IN: expiresInSchema.default("15m"),
  JWT_REFRESH_EXPIRES_IN: expiresInSchema.default("30d"),

  // Set to "false" to disable every cron job (e.g. when running several API instances
  // and only one of them should run jobs).
  ENABLE_JOBS: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),

  FMP_API_KEY: optionalString, // reserved — FMP integration is not implemented yet
  GEMINI_API_KEY: optionalString,
  GEMINI_MODEL: z.string().default("gemini-3.8-flash"),
  DISCORD_PUBLIC_KEY: optionalString, // required only when the Discord bot is enabled
  DISCORD_BOT_TOKEN: optionalString,
  DISCORD_APPLICATION_ID: optionalString,

  // Cloudflare R2 (S3-compatible) — slip images. All four are needed to enable uploads.
  R2_ACCOUNT_ID: optionalString,
  R2_ACCESS_KEY_ID: optionalString,
  R2_SECRET_ACCESS_KEY: optionalString,
  R2_BUCKET: optionalString,
  // Override for S3-compatible stand-ins (e.g. MinIO in tests); defaults to the R2 account endpoint.
  R2_ENDPOINT: optionalString,
  R2_PRESIGN_TTL_SECONDS: z.coerce.number().int().min(60).max(7 * 24 * 3600).default(600),
  SLIP_MAX_BYTES: z.coerce.number().int().positive().default(5 * 1024 * 1024),
  // Daily storage check: alert ADMIN users (SYSTEM_ALERT) when slip images use more than
  // these percentages of the quota. Default quota = R2 free tier (10 GB).
  R2_STORAGE_QUOTA_BYTES: z.coerce.number().int().positive().default(10 * 1024 ** 3),
  R2_STORAGE_ALERT_PERCENTS: z
    .string()
    .default("80,90,100")
    .transform((value, ctx) => {
      const percents = value.split(",").map((p) => Number(p.trim()));
      if (percents.some((p) => !Number.isFinite(p) || p <= 0)) {
        ctx.addIssue({ code: "custom", message: "must be comma-separated positive numbers, e.g. 80,90,100" });
        return z.NEVER;
      }
      return [...new Set(percents)].sort((a, b) => a - b);
    }),

  // Skip the one-time Yahoo price/FX backfill on startup (e.g. offline dev).
  ENABLE_HISTORY_BOOTSTRAP: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "❌ Invalid environment variables:",
    parsed.error.flatten().fieldErrors,
  );
  process.exit(1);
}

if (parsed.data.JWT_ACCESS_SECRET === parsed.data.JWT_REFRESH_SECRET) {
  console.error(
    "❌ Invalid environment variables: JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different",
  );
  process.exit(1);
}

export const env = parsed.data;
