import { prisma } from "../../lib/prisma";
import { StrategyType, PortfolioType } from "@prisma/client";

export class PortfolioService {
  static async getTags() {
    return await prisma.tag.findMany();
  }

  static async createTag(name: string, color?: string) {
    return await prisma.tag.create({
      data: {
        name,
        color: color || "#000000",
      },
    });
  }

  static async getPortfolios(userId: string) {
    return await prisma.portfolio.findMany({
      where: {
        userId,
        deletedAt: null,
      },
      include: {
        cashAccounts: true,
        tags: { include: { tag: true } },
      },
    });
  }

  static async createPortfolio(
    userId: string,
    input: {
      name: string;
      description?: string;
      imageUrl?: string;
      strategy?: StrategyType;
      baseCurrency?: string;
      isMargin?: boolean;
      type?: PortfolioType;
      tagIds?: string[];
    },
  ) {
    return await prisma.$transaction(async (tx) => {
      const portfolio = await tx.portfolio.create({
        data: {
          userId,
          name: input.name,
          strategy: input.strategy || "VALUE",
          baseCurrency: input.baseCurrency || "USD",
          isMargin: input.isMargin || false,
          type: input.type || "REAL",
          ...(input.description && { description: input.description }),
          ...(input.imageUrl && { imageUrl: input.imageUrl }),
          // -------------------------------------------------------------
          ...(input.tagIds &&
            input.tagIds.length > 0 && {
              tags: {
                create: input.tagIds.map((tagId) => ({
                  tag: {
                    connect: {
                      id: tagId,
                    },
                  },
                })),
              },
            }),
        },
        include: {
          tags: {
            include: {
              tag: true,
            },
          },
          cashAccounts: true,
        },
      });

      await tx.cashAccount.create({
        data: {
          portfolioId: portfolio.id,
          currency: portfolio.baseCurrency,
          balance: 0,
          isDomestic: portfolio.baseCurrency == "THB",
        },
      });

      return portfolio;
    });
  }
  static async resetPortfolio(portfolioId: string) {
    return await prisma.$transaction(async (tx) => {
      await tx.ledgerEntry.deleteMany({
        where: { portfolioId },
      });
      await tx.transaction.deleteMany({
        where: { portfolioId },
      });
      await tx.position.deleteMany({
        where: { portfolioId },
      });
      await tx.taxLot.deleteMany({
        where: { portfolioId },
      });
      await tx.portfolioSnapshot.updateMany({
        where: { portfolioId },
        data: { balance: 0 },
      });
      return true;
    });
  }
}
