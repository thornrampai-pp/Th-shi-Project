import { prisma } from "../src/config/prisma";
import { redis } from "../src/config/redis";
import bcrypt from "bcrypt";
import { createTransaction } from "../src/modules/transaction/transaction.service";
import { createSnapshot } from "../src/modules/snapshot/snapshot.service";

async function main() {
  console.log("🌱 Seeding...");

  const passwordHash = await bcrypt.hash("password123", 12);

  const user = await prisma.user.upsert({
    where: { email: "demo@example.com" },
    update: {},
    create: {
      email: "demo@example.com",
      passwordHash,
      firstName: "Demo",
      lastName: "User",
    },
  });

  // Assets — inserted directly instead of fetched from Yahoo, so seeding stays fast,
  // deterministic, and works offline with no rate-limit dependency.
  const assetSeeds = [
    {
      symbol: "AAPL",
      name: "Apple Inc.",
      type: "STOCK" as const,
      currency: "USD",
      exchange: "NASDAQ",
      sector: "Technology",
    },
    {
      symbol: "MSFT",
      name: "Microsoft Corporation",
      type: "STOCK" as const,
      currency: "USD",
      exchange: "NASDAQ",
      sector: "Technology",
    },
    {
      symbol: "PTT",
      name: "PTT Public Company Limited",
      type: "STOCK" as const,
      currency: "THB",
      exchange: "SET",
      sector: "Energy",
    },
  ];

  const seededAssets = await Promise.all(
    assetSeeds.map((asset) =>
      prisma.asset.upsert({
        where: {
          symbol_exchange: { symbol: asset.symbol, exchange: asset.exchange },
        },
        update: {},
        create: asset,
      }),
    ),
  );
  const [aapl, msft, ptt] = seededAssets;
  if (!aapl || !msft || !ptt) throw new Error("Asset seeding failed");

  // Portfolios — built the same way createPortfolio() builds them: Portfolio + a
  // zero-balance CashAccount in the same currency. Actual cash gets seeded below via
  // real DEPOSIT transactions, not a direct balance write (see the note in that block).
  const realPortfolio = await prisma.portfolio.upsert({
    where: { id: "seed-real-portfolio" },
    update: {},
    create: {
      id: "seed-real-portfolio",
      userId: user.id,
      name: "พอร์ตหลัก",
      strategy: "VALUE",
      baseCurrency: "THB",
      type: "REAL",
      cashAccounts: {
        create: { currency: "THB", isDomestic: true, balance: 0 },
      },
    },
  });

  const paperPortfolio = await prisma.portfolio.upsert({
    where: { id: "seed-paper-portfolio" },
    update: {},
    create: {
      id: "seed-paper-portfolio",
      userId: user.id,
      name: "พอร์ตทดลอง (Paper)",
      strategy: "TRADING",
      baseCurrency: "USD",
      type: "PAPER",
      initialPaperBalance: 10000,
      cashAccounts: {
        create: { currency: "USD", isDomestic: false, balance: 0 },
      },
    },
  });

  const tag = await prisma.tag.upsert({
    where: { name: "หุ้นปันผล" },
    update: {},
    create: { name: "หุ้นปันผล", color: "#2ecc71" },
  });

  await prisma.portfolioTag.upsert({
    where: {
      portfolioId_tagId: { portfolioId: realPortfolio.id, tagId: tag.id },
    },
    update: {},
    create: { portfolioId: realPortfolio.id, tagId: tag.id },
  });

  // --- Transactions ---
  //
  // Seeded by calling the REAL createTransaction() service — not a raw prisma.create() —
  // so this exercises the exact same code path production traffic uses: Ledger balance
  // validation, weighted-average cost basis on BUY, FIFO TaxLot consumption + realizedPL
  // on SELL, and the EQUITY-balanced postings for DEPOSIT/WITHDRAW/DIVIDEND. If any of
  // that logic is broken, seeding fails loudly here instead of silently producing bad
  // data. Guarded to run only once — safe to re-run `npm run db:seed` any number of times.

  const realTxCount = await prisma.transaction.count({
    where: { portfolioId: realPortfolio.id },
  });
  if (realTxCount === 0) {
    console.log("   seeding transactions for พอร์ตหลัก (THB / PTT)...");

    await createTransaction(user.id, {
      portfolioId: realPortfolio.id,
      type: "DEPOSIT",
      currency: "THB",
      amount: 100_000,
    });

    // Two BUYs on the same asset — exercises the weighted-average cost update path.
    await createTransaction(user.id, {
      portfolioId: realPortfolio.id,
      type: "BUY",
      assetId: ptt.id,
      quantity: 100,
      price: 35.5,
      fee: 20,
    });
    await createTransaction(user.id, {
      portfolioId: realPortfolio.id,
      type: "BUY",
      assetId: ptt.id,
      quantity: 50,
      price: 36.0,
      fee: 15,
    });

    // Partial SELL — exercises FIFO TaxLot consumption (eats into the first lot only)
    // and realizedPL calculation.
    await createTransaction(user.id, {
      portfolioId: realPortfolio.id,
      type: "SELL",
      assetId: ptt.id,
      quantity: 60,
      price: 37.2,
      fee: 25,
    });

    await createTransaction(user.id, {
      portfolioId: realPortfolio.id,
      type: "DIVIDEND",
      assetId: ptt.id,
      currency: "THB",
      amount: 500,
    });

    await createTransaction(user.id, {
      portfolioId: realPortfolio.id,
      type: "WITHDRAW",
      currency: "THB",
      amount: 5_000,
    });
  } else {
    console.log(
      `   (skipped — พอร์ตหลัก already has ${realTxCount} transactions)`,
    );
  }

  const paperTxCount = await prisma.transaction.count({
    where: { portfolioId: paperPortfolio.id },
  });
  if (paperTxCount === 0) {
    console.log("   seeding transactions for พอร์ตทดลอง (USD / AAPL, MSFT)...");

    await createTransaction(user.id, {
      portfolioId: paperPortfolio.id,
      type: "DEPOSIT",
      currency: "USD",
      amount: 10_000,
    });

    await createTransaction(user.id, {
      portfolioId: paperPortfolio.id,
      type: "BUY",
      assetId: aapl.id,
      quantity: 10,
      price: 150,
      fee: 1,
    });
    await createTransaction(user.id, {
      portfolioId: paperPortfolio.id,
      type: "BUY",
      assetId: msft.id,
      quantity: 5,
      price: 300,
      fee: 1,
    });
    await createTransaction(user.id, {
      portfolioId: paperPortfolio.id,
      type: "SELL",
      assetId: aapl.id,
      quantity: 3,
      price: 160,
      fee: 1,
    });
  } else {
    console.log(
      `   (skipped — พอร์ตทดลอง already has ${paperTxCount} transactions)`,
    );
  }

  // --- Snapshot ---
  //
  // Takes a DAILY snapshot right after seeding the transactions above, via the real
  // createSnapshot() — exercises cash aggregation, position market-value lookup (falls
  // back to avgPrice since Yahoo hasn't synced AssetPrice history for these seed
  // assets), and the TWR calc end-to-end, same as the cron job will do daily.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  await createSnapshot(realPortfolio.id, today, "DAILY");
  await createSnapshot(paperPortfolio.id, today, "DAILY");

  // --- Summary ---
  const [realCash, paperCash, pttPosition] = await Promise.all([
    prisma.cashAccount.findFirst({ where: { portfolioId: realPortfolio.id } }),
    prisma.cashAccount.findFirst({ where: { portfolioId: paperPortfolio.id } }),
    prisma.position.findUnique({
      where: {
        portfolioId_assetId: { portfolioId: realPortfolio.id, assetId: ptt.id },
      },
    }),
  ]);

  console.log("✅ Seeded:");
  console.log(`   user:            ${user.email}  (password: password123)`);
  console.log(`   assets:          AAPL, MSFT, PTT`);
  console.log(
    `   real portfolio:  ${realPortfolio.id} — cash: ${realCash ? Number(realCash.balance) : 0} THB`,
  );
  if (pttPosition) {
    console.log(
      `                    PTT position: ${Number(pttPosition.quantity)} shares @ avg ${Number(pttPosition.avgPrice).toFixed(2)}, realizedPL ${Number(pttPosition.realizedPL).toFixed(2)}, totalDiv ${Number(pttPosition.totalDiv).toFixed(2)}`,
    );
  }
  console.log(
    `   paper portfolio: ${paperPortfolio.id} — cash: ${paperCash ? Number(paperCash.balance) : 0} USD`,
  );
  console.log(
    `   snapshot taken for both portfolios (${today.toISOString().slice(0, 10)})`,
  );
}

main()
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  })
  // Redis must be closed too (pulled in via the FX/cache layer) or the process never exits.
  .finally(() => Promise.all([prisma.$disconnect(), redis.quit()]));
