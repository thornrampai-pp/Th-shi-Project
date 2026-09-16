import { prisma } from '../../config/prisma';
import { AppError } from '../../common/errors/AppError';
import { assertPortfolioOwnership } from '../../common/utils/portfolio-ownership.util';

export type StrategyTypeValue = 'VALUE' | 'GROWTH' | 'DIVIDEND' | 'TRADING' | 'QUANT_ALGO';
export type PortfolioTypeValue = 'REAL' | 'PAPER';

const portfolioInclude = {
  cashAccounts: true,
  tags: { include: { tag: true } },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializePortfolio(portfolio: any) {
  return { ...portfolio, tags: portfolio.tags.map((pt: { tag: unknown }) => pt.tag) };
}

export async function createPortfolio(
  userId: string,
  data: {
    name: string;
    strategy: StrategyTypeValue;
    baseCurrency: string;
    type: PortfolioTypeValue;
    isMargin?: boolean;
    initialPaperBalance?: number;
  },
) {
  if (data.type === 'PAPER' && data.initialPaperBalance == null) {
    throw AppError.badRequest('initialPaperBalance is required when creating a PAPER portfolio');
  }

  const created = await prisma.$transaction(async (tx) => {
    const portfolio = await tx.portfolio.create({
      data: {
        userId,
        name: data.name,
        strategy: data.strategy,
        baseCurrency: data.baseCurrency,
        type: data.type,
        isMargin: data.isMargin ?? false,
        initialPaperBalance: data.initialPaperBalance,
      },
    });

    // Balance starts at 0 even for PAPER — initialPaperBalance is config only. The actual
    // cash gets seeded via a real DEPOSIT Transaction once Phase 5 (Ledger/Transaction)
    // exists, so funding a paper portfolio goes through the exact same audited path as
    // funding a real one.
    await tx.cashAccount.create({
      data: {
        portfolioId: portfolio.id,
        currency: data.baseCurrency,
        isDomestic: data.baseCurrency === 'THB',
        balance: 0,
      },
    });

    return portfolio;
  });

  return getPortfolioById(userId, created.id);
}

export async function getPortfolioById(userId: string, id: string) {
  const portfolio = await prisma.portfolio.findUnique({ where: { id }, include: portfolioInclude });
  if (!portfolio || portfolio.userId !== userId || portfolio.deletedAt) {
    throw AppError.notFound('Portfolio not found');
  }
  return serializePortfolio(portfolio);
}

export async function listMyPortfolios(userId: string, type?: PortfolioTypeValue) {
  const portfolios = await prisma.portfolio.findMany({
    where: { userId, type, deletedAt: null },
    include: portfolioInclude,
    orderBy: { createdAt: 'desc' },
  });
  return portfolios.map(serializePortfolio);
}

export async function updatePortfolio(
  userId: string,
  id: string,
  data: { name?: string; description?: string; imageUrl?: string; strategy?: StrategyTypeValue },
) {
  await assertPortfolioOwnership(userId, id);
  const updated = await prisma.portfolio.update({ where: { id }, data, include: portfolioInclude });
  return serializePortfolio(updated);
}

export async function deletePortfolio(userId: string, id: string): Promise<boolean> {
  await assertPortfolioOwnership(userId, id);
  await prisma.portfolio.update({ where: { id }, data: { deletedAt: new Date() } });
  return true;
}

export async function addCashAccount(
  userId: string,
  portfolioId: string,
  currency: string,
  isDomestic = false,
) {
  await assertPortfolioOwnership(userId, portfolioId);

  const existing = await prisma.cashAccount.findUnique({
    where: { portfolioId_currency_isDomestic: { portfolioId, currency, isDomestic } },
  });
  if (existing) {
    throw AppError.conflict(
      `This portfolio already has a ${currency} (${isDomestic ? 'domestic' : 'foreign'}) cash account`,
    );
  }

  return prisma.cashAccount.create({ data: { portfolioId, currency, isDomestic, balance: 0 } });
}

export async function listCashAccounts(userId: string, portfolioId: string) {
  await assertPortfolioOwnership(userId, portfolioId);
  return prisma.cashAccount.findMany({ where: { portfolioId } });
}

export async function createTag(name: string, color = '#000000') {
  return prisma.tag.upsert({ where: { name }, update: { color }, create: { name, color } });
}

export async function listTags() {
  return prisma.tag.findMany({ orderBy: { name: 'asc' } });
}

export async function tagPortfolio(userId: string, portfolioId: string, tagId: string) {
  await assertPortfolioOwnership(userId, portfolioId);

  const tag = await prisma.tag.findUnique({ where: { id: tagId } });
  if (!tag) {
    throw AppError.notFound('Tag not found');
  }

  await prisma.portfolioTag.upsert({
    where: { portfolioId_tagId: { portfolioId, tagId } },
    update: {},
    create: { portfolioId, tagId },
  });

  return getPortfolioById(userId, portfolioId);
}
