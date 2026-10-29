// Shared setup for integration tests that hit a REAL database (see
// ledger.service.concurrency.test.ts for the original pattern this follows). Every
// `*.integration.test.ts` file wraps its suite in `describe.skipIf(!runIntegrationTests)`
// so `npm test` only runs these when explicitly opted in:
//
//   npm run test:integration
//
// Point DATABASE_URL at a disposable/test database first — these create and delete
// real rows (scoped to users created here, so they never touch other data).
import { prisma } from "../config/prisma";

export const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === "true";

let counter = 0;
/** Unique-enough per process run — avoids collisions between tests running in parallel. */
function unique(label: string): string {
  counter += 1;
  return `${label}-${Date.now()}-${counter}`;
}

export async function createTestUser(overrides: { role?: "USER" | "ADMIN" } = {}) {
  return prisma.user.create({
    data: {
      email: `${unique("test-user")}@test.local`,
      passwordHash: "x",
      role: overrides.role ?? "USER",
    },
  });
}

export async function createTestPortfolio(
  userId: string,
  overrides: Partial<{ type: "REAL" | "PAPER"; baseCurrency: string; name: string }> = {},
) {
  return prisma.portfolio.create({
    data: {
      userId,
      name: overrides.name ?? unique("Test Portfolio"),
      baseCurrency: overrides.baseCurrency ?? "THB",
      type: overrides.type ?? "PAPER",
    },
  });
}

export async function createTestAsset(
  overrides: Partial<{ symbol: string; currency: string; exchange: string; type: "STOCK" | "ETF" | "CRYPTO" | "FOREX" | "GOLD" }> = {},
) {
  return prisma.asset.create({
    data: {
      symbol: overrides.symbol ?? unique("TEST").toUpperCase(),
      name: "Test Asset",
      type: overrides.type ?? "STOCK",
      currency: overrides.currency ?? "THB",
      exchange: overrides.exchange ?? "TEST",
    },
  });
}

export async function createCashAccount(
  portfolioId: string,
  overrides: Partial<{ currency: string; balance: number }> = {},
) {
  return prisma.cashAccount.create({
    data: {
      portfolioId,
      currency: overrides.currency ?? "THB",
      balance: overrides.balance ?? 1_000_000,
    },
  });
}

/** Deletes a test user (cascades portfolios/orders/transactions/...) and, if given, the
 * assets created alongside it (Asset has no owner, and Order→Asset has no cascade, so
 * the user must be deleted first). */
export async function cleanupTestUser(userId: string, assetIds: string[] = []) {
  await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  if (assetIds.length > 0) {
    await prisma.asset.deleteMany({ where: { id: { in: assetIds } } }).catch(() => undefined);
  }
}
