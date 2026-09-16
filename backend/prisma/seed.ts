import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { env } from '../src/config/env';
import bcrypt from 'bcrypt';

const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({
  adapter,
});

async function main() {
  console.log('🌱 Seeding...');

  const passwordHash = await bcrypt.hash('password123', 12);

  const user = await prisma.user.upsert({
    where: { email: 'demo@example.com' },
    update: {},
    create: {
      email: 'demo@example.com',
      passwordHash,
      firstName: 'Demo',
      lastName: 'User',
    },
  });

  const assetSeeds = [
    {
      symbol: 'AAPL',
      name: 'Apple Inc.',
      type: 'STOCK' as const,
      currency: 'USD',
      exchange: 'NASDAQ',
      sector: 'Technology',
    },
    {
      symbol: 'MSFT',
      name: 'Microsoft Corporation',
      type: 'STOCK' as const,
      currency: 'USD',
      exchange: 'NASDAQ',
      sector: 'Technology',
    },
    {
      symbol: 'PTT',
      name: 'PTT Public Company Limited',
      type: 'STOCK' as const,
      currency: 'THB',
      exchange: 'SET',
      sector: 'Energy',
    },
  ];

  const assets = await Promise.all(
    assetSeeds.map((asset) =>
      prisma.asset.upsert({
        where: {
          symbol_exchange: {
            symbol: asset.symbol,
            exchange: asset.exchange,
          },
        },
        update: {},
        create: asset,
      }),
    ),
  );

  const realPortfolio = await prisma.portfolio.upsert({
    where: { id: 'seed-real-portfolio' },
    update: {},
    create: {
      id: 'seed-real-portfolio',
      userId: user.id,
      name: 'พอร์ตหลัก',
      strategy: 'VALUE',
      baseCurrency: 'THB',
      type: 'REAL',
      cashAccounts: {
        create: {
          currency: 'THB',
          isDomestic: true,
          balance: 0,
        },
      },
    },
  });

  const paperPortfolio = await prisma.portfolio.upsert({
    where: { id: 'seed-paper-portfolio' },
    update: {},
    create: {
      id: 'seed-paper-portfolio',
      userId: user.id,
      name: 'พอร์ตทดลอง (Paper)',
      strategy: 'TRADING',
      baseCurrency: 'USD',
      type: 'PAPER',
      initialPaperBalance: 10000,
      cashAccounts: {
        create: {
          currency: 'USD',
          isDomestic: false,
          balance: 0,
        },
      },
    },
  });

  const tag = await prisma.tag.upsert({
    where: { name: 'หุ้นปันผล' },
    update: {},
    create: {
      name: 'หุ้นปันผล',
      color: '#2ecc71',
    },
  });

  await prisma.portfolioTag.upsert({
    where: {
      portfolioId_tagId: {
        portfolioId: realPortfolio.id,
        tagId: tag.id,
      },
    },
    update: {},
    create: {
      portfolioId: realPortfolio.id,
      tagId: tag.id,
    },
  });

  console.log('✅ Seeded:');
  console.log(`   user:            ${user.email} (password: password123)`);
  console.log(`   assets:          ${assets.map((a) => a.symbol).join(', ')}`);
  console.log(
    `   real portfolio:  ${realPortfolio.id} — 0 THB`,
  );
  console.log(
    `   paper portfolio: ${paperPortfolio.id} — 0 USD`,
  );
}

main()
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });