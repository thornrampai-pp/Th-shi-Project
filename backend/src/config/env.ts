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

const optionalPositiveInt = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.coerce.number().int().positive().optional(),
);

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(4000),
  // Development logs every SQL query; "false" turns that off (bulk scripts — one
  // statement import run otherwise writes ~16k query lines and buries the real output).
  PRISMA_LOG_QUERIES: z.enum(["true", "false"]).optional(),

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

  // Who's allowed to call /graphql from a browser. Comma-separated for multiple
  // deployments (e.g. production + Vercel preview URLs).
  FRONTEND_URL: z
    .string()
    .default("http://localhost:3000")
    .transform((value) => value.split(",").map((origin) => origin.trim())),

  // Set to "false" to disable every cron job (e.g. when running several API instances
  // and only one of them should run jobs).
  ENABLE_JOBS: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),

  // Enables POST /jobs/run (Bearer token) — for hosts that sleep when idle, where an
  // outside scheduler has to trigger the jobs instead of the in-process cron.
  CRON_SECRET: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(32, "CRON_SECRET must be at least 32 chars").optional(),
  ),

  FMP_API_KEY: optionalString, // reserved — FMP integration is not implemented yet
  GEMINI_API_KEY: optionalString,
  GEMINI_MODEL: z.string().default("gemini-3.8-flash"),
  // Tried in order when GEMINI_MODEL is overloaded (5xx) or out of quota (429), e.g.
  // "gemini-3.7-flash,gemini-3.5-flash". Must read images/PDFs. Empty = no fallback.
  GEMINI_FALLBACK_MODELS: z
    .string()
    .default("")
    .transform((value) => value.split(",").map((m) => m.trim()).filter(Boolean)),
  // Gemini's quota for your tier/model (see AI Studio → Rate limits). The API doesn't
  // report it, so the admin System page compares its own call counts to these. Unset =
  // usage shown without a limit.
  // Per-request timeout. Multi-page statement PDFs take ~60s; 3 minutes leaves headroom.
  GEMINI_TIMEOUT_MS: z.coerce.number().int().min(10_000).max(600_000).default(180_000),
  GEMINI_RPM_LIMIT: optionalPositiveInt, // requests per minute
  GEMINI_TPM_LIMIT: optionalPositiveInt, // tokens per minute
  GEMINI_RPD_LIMIT: optionalPositiveInt, // requests per day (resets midnight Pacific)
  // Thai mutual funds — SEC Open API (secopendata.sec.or.th → subscribe "Fund API").
  // One key covers fund search and daily NAV. Unset = funds can't be looked up.
  SEC_API_KEY: optionalString,
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
  // Monthly R2 operation allowance shown on the System page. Defaults = R2 free tier.
  R2_CLASS_A_MONTHLY_LIMIT: z.coerce.number().int().positive().default(1_000_000),
  R2_CLASS_B_MONTHLY_LIMIT: z.coerce.number().int().positive().default(10_000_000),
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
