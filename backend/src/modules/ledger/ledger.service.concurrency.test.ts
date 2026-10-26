// ⚠️ INTEGRATION TEST — hits a REAL PostgreSQL database via `prisma`. Not run by
// `npm test` by default. Opt in explicitly:
//
//   RUN_INTEGRATION_TESTS=true npx vitest run ledger.service.concurrency
//
// Point DATABASE_URL at a disposable/test database before running this — it creates
// and deletes real rows. Never run against a production database.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../config/prisma';
import { postLedgerEntries } from './ledger.service';
import type { LedgerEntryInput } from './ledger.service';

const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === 'true';

describe.skipIf(!runIntegrationTests)('postLedgerEntries — concurrency (real DB)', () => {
  let userId: string;
  let portfolioId: string;
  let cashAccountId: string;
  let assetId: string;
  const createdTransactionIds: string[] = [];

  const STARTING_BALANCE = 1000;
  const CONCURRENT_COUNT = 20;
  const AMOUNT_PER_POSTING = 10;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: `ledger-concurrency-${Date.now()}@test.local`, passwordHash: 'x' },
    });
    userId = user.id;

    const portfolio = await prisma.portfolio.create({
      data: { userId, name: 'Concurrency Test Portfolio', strategy: 'VALUE', baseCurrency: 'USD', type: 'REAL' },
    });
    portfolioId = portfolio.id;

    const cashAccount = await prisma.cashAccount.create({
      data: { portfolioId, currency: 'USD', isDomestic: false, balance: STARTING_BALANCE },
    });
    cashAccountId = cashAccount.id;

    const asset = await prisma.asset.upsert({
      where: { symbol_exchange: { symbol: 'LEDGERTEST', exchange: 'GLOBAL' } },
      update: {},
      create: { symbol: 'LEDGERTEST', name: 'Ledger Test Asset', type: 'STOCK', currency: 'USD', exchange: 'GLOBAL' },
    });
    assetId = asset.id;
  });

  afterAll(async () => {
    // Clean up everything this test created, in FK-safe order, so re-runs start fresh.
    await prisma.ledgerEntry.deleteMany({ where: { portfolioId } });
    if (createdTransactionIds.length > 0) {
      await prisma.transaction.deleteMany({ where: { id: { in: createdTransactionIds } } });
    }
    await prisma.cashAccount.deleteMany({ where: { portfolioId } });
    await prisma.portfolio.delete({ where: { id: portfolioId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('applies concurrent postings to the same CashAccount with no lost updates', async () => {
    // Fire all postings at once — this is the actual race: N transactions all trying
    // to increment/decrement the SAME CashAccount row concurrently. If Prisma's
    // `{ increment: X }` (translated to `UPDATE ... SET balance = balance + X`) were
    // NOT safe under concurrency, some of these updates would get lost and the final
    // balance would come out wrong.
    const postings = Array.from({ length: CONCURRENT_COUNT }, async () => {
      const transaction = await prisma.transaction.create({
        data: { portfolioId, type: 'BUY', mainAssetId: assetId },
      });
      createdTransactionIds.push(transaction.id);

      const entries: LedgerEntryInput[] = [
        {
          portfolioId,
          accountType: 'CASH',
          side: 'CREDIT', // cash leaving the account
          amount: AMOUNT_PER_POSTING,
          assetSymbol: 'USD',
          cashAccountId,
        },
        {
          portfolioId,
          accountType: 'ASSET',
          side: 'DEBIT', // asset value coming in
          amount: AMOUNT_PER_POSTING,
          assetSymbol: 'LEDGERTEST',
          assetId,
        },
      ];

      return prisma.$transaction((tx) => postLedgerEntries(tx, transaction.id, entries));
    });

    await Promise.all(postings);

    const finalCashAccount = await prisma.cashAccount.findUniqueOrThrow({ where: { id: cashAccountId } });
    const expectedBalance = STARTING_BALANCE - CONCURRENT_COUNT * AMOUNT_PER_POSTING;

    expect(Number(finalCashAccount.balance)).toBe(expectedBalance);

    // Every posting should have written exactly 2 entries — none lost, none duplicated.
    const entryCount = await prisma.ledgerEntry.count({ where: { portfolioId } });
    expect(entryCount).toBe(CONCURRENT_COUNT * 2);
  });
});
