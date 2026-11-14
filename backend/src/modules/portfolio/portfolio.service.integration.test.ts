// ⚠️ INTEGRATION TEST — hits a REAL PostgreSQL database. Not run by `npm test` by
// default: `npm run test:integration` (see src/test-utils/integration.ts).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "../../config/prisma";
import * as portfolioService from "./portfolio.service";
import { runIntegrationTests, createTestUser, cleanupTestUser } from "../../test-utils/integration";

describe.skipIf(!runIntegrationTests)("portfolio.service (real DB)", () => {
  let userId: string;
  let otherUserId: string;

  beforeEach(async () => {
    userId = (await createTestUser()).id;
    otherUserId = (await createTestUser()).id;
  });

  afterEach(async () => {
    await cleanupTestUser(userId);
    await cleanupTestUser(otherUserId);
  });

  describe("createPortfolio", () => {
    it("requires initialPaperBalance for a PAPER portfolio", async () => {
      await expect(
        portfolioService.createPortfolio(userId, { name: "P", strategy: "VALUE", baseCurrency: "THB", type: "PAPER" }),
      ).rejects.toThrow(/initialPaperBalance is required/i);
    });

    it("opens a zero-balance cash account in the base currency", async () => {
      const portfolio = await portfolioService.createPortfolio(userId, {
        name: "My Portfolio",
        strategy: "VALUE",
        baseCurrency: "USD",
        type: "REAL",
      });
      expect(portfolio.cashAccounts).toHaveLength(1);
      expect(portfolio.cashAccounts[0].currency).toBe("USD");
      expect(Number(portfolio.cashAccounts[0].balance)).toBe(0);
    });
  });

  describe("ownership", () => {
    it("404s when another user looks up the portfolio", async () => {
      const portfolio = await portfolioService.createPortfolio(userId, {
        name: "Private",
        strategy: "VALUE",
        baseCurrency: "THB",
        type: "REAL",
      });
      await expect(portfolioService.getPortfolioById(otherUserId, portfolio.id)).rejects.toThrow(/not found/i);
      await expect(portfolioService.updatePortfolio(otherUserId, portfolio.id, { name: "Hijacked" })).rejects.toThrow(
        /not found/i,
      );
    });
  });

  describe("updatePortfolio / deletePortfolio", () => {
    it("updates fields and soft-deletes (excluded from lookups afterward)", async () => {
      const portfolio = await portfolioService.createPortfolio(userId, {
        name: "Renamable",
        strategy: "VALUE",
        baseCurrency: "THB",
        type: "REAL",
      });

      const updated = await portfolioService.updatePortfolio(userId, portfolio.id, { name: "Renamed" });
      expect(updated.name).toBe("Renamed");

      await portfolioService.deletePortfolio(userId, portfolio.id);
      await expect(portfolioService.getPortfolioById(userId, portfolio.id)).rejects.toThrow(/not found/i);

      const list = await portfolioService.listMyPortfolios(userId);
      expect(list.find((p) => p.id === portfolio.id)).toBeUndefined();
    });
  });

  describe("addCashAccount", () => {
    it("rejects a duplicate currency + isDomestic combination", async () => {
      const portfolio = await portfolioService.createPortfolio(userId, {
        name: "Multi-currency",
        strategy: "VALUE",
        baseCurrency: "THB",
        type: "REAL",
      });
      await portfolioService.addCashAccount(userId, portfolio.id, "USD", false);
      await expect(portfolioService.addCashAccount(userId, portfolio.id, "USD", false)).rejects.toThrow(
        /already has a/i,
      );
    });
  });

  describe("tagPortfolio", () => {
    it("rejects an unknown tag", async () => {
      const portfolio = await portfolioService.createPortfolio(userId, {
        name: "Tagged",
        strategy: "VALUE",
        baseCurrency: "THB",
        type: "REAL",
      });
      await expect(portfolioService.tagPortfolio(userId, portfolio.id, "00000000-0000-0000-0000-000000000000")).rejects.toThrow(
        /tag not found/i,
      );
    });

    it("attaches a tag, idempotently", async () => {
      const portfolio = await portfolioService.createPortfolio(userId, {
        name: "Tagged",
        strategy: "VALUE",
        baseCurrency: "THB",
        type: "REAL",
      });
      const tag = await portfolioService.createTag(`integration-tag-${Date.now()}`);

      await portfolioService.tagPortfolio(userId, portfolio.id, tag.id);
      const result = await portfolioService.tagPortfolio(userId, portfolio.id, tag.id);
      expect(result.tags.map((t: { id: string }) => t.id)).toEqual([tag.id]);

      await prisma.tag.delete({ where: { id: tag.id } });
    });
  });

  describe("getCashPool", () => {
    it("sums every REAL portfolio's cash per currency — one shared pool, PAPER money left out", async () => {
      const mk = (name: string, type: "REAL" | "PAPER" = "REAL") =>
        prisma.portfolio.create({ data: { userId, name, baseCurrency: "THB", type } });
      const fire = await mk("Fire");
      const stock = await mk("Stock");
      const paper = await mk("Paper", "PAPER");
      const theirs = await prisma.portfolio.create({ data: { userId: otherUserId, name: "X", baseCurrency: "THB", type: "REAL" } });
      await prisma.cashAccount.createMany({
        data: [
          { portfolioId: fire.id, currency: "USD", balance: 12.5 },
          { portfolioId: stock.id, currency: "USD", balance: 7.5 },
          { portfolioId: stock.id, currency: "THB", balance: -1e-8 },
          { portfolioId: paper.id, currency: "USD", balance: 1000 },
          { portfolioId: theirs.id, currency: "USD", balance: 99 },
        ],
      });
      expect(await portfolioService.getCashPool(userId)).toEqual([
        { currency: "THB", balance: 0 },
        { currency: "USD", balance: 20 },
      ]);
    });
  });
});
