// ⚠️ INTEGRATION TEST — hits a REAL PostgreSQL database. Not run by `npm test` by
// default: `npm run test:integration` (see src/test-utils/integration.ts).
//
// Yahoo itself is mocked (not just cached) — FX tests must never depend on live market
// data or network availability to pass.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../common/integrations/yahoo-finance.util", () => ({
  fetchYahooQuote: vi.fn(),
  fetchYahooHistorical: vi.fn(),
}));

import { fetchYahooQuote } from "../../common/integrations/yahoo-finance.util";
import { prisma } from "../../config/prisma";
import { redis } from "../../config/redis";
import * as fxService from "./fx.service";
import { runIntegrationTests } from "../../test-utils/integration";

const mockFetchQuote = vi.mocked(fetchYahooQuote);

const FROM = "USD";
const TO = "THB";

async function clearFxState() {
  await prisma.exchangeRate.deleteMany({ where: { fromCurrency: FROM, toCurrency: TO } });
  const keys = await redis.keys(`fx:${FROM}${TO}`);
  if (keys.length) await redis.del(...keys);
}

describe.skipIf(!runIntegrationTests)("fx.service (real DB, Yahoo mocked)", () => {
  beforeEach(async () => {
    mockFetchQuote.mockReset();
    await clearFxState();
  });
  afterEach(clearFxState);

  it("returns 1 for identical currencies without calling Yahoo", async () => {
    await expect(fxService.getExchangeRate("THB", "THB")).resolves.toBe(1);
    expect(mockFetchQuote).not.toHaveBeenCalled();
  });

  it("fetches and persists the live rate", async () => {
    mockFetchQuote.mockResolvedValue({ regularMarketPrice: 36.5 } as never);

    const rate = await fxService.getExchangeRate(FROM, TO);
    expect(rate).toBe(36.5);

    const stored = await prisma.exchangeRate.findFirst({ where: { fromCurrency: FROM, toCurrency: TO } });
    expect(Number(stored?.rate)).toBe(36.5);
  });

  it("falls back to the last stored rate when Yahoo is unavailable", async () => {
    await prisma.exchangeRate.create({
      data: { fromCurrency: FROM, toCurrency: TO, date: new Date("2020-01-01"), rate: 30 },
    });
    mockFetchQuote.mockRejectedValue(new Error("Yahoo is down"));

    await expect(fxService.getExchangeRate(FROM, TO)).resolves.toBe(30);
  });

  it("throws when Yahoo fails and there's no stored rate to fall back to", async () => {
    mockFetchQuote.mockRejectedValue(new Error("Yahoo is down"));
    await expect(fxService.getExchangeRate(FROM, TO)).rejects.toThrow(/could not get/i);
  });

  it("convertAmount multiplies by the resolved rate", async () => {
    mockFetchQuote.mockResolvedValue({ regularMarketPrice: 2 } as never);
    await expect(fxService.convertAmount(10, FROM, TO)).resolves.toBe(20);
  });

  describe("resolveHomeFxRate", () => {
    it("returns 1 when the currency already is the home currency", async () => {
      await expect(fxService.resolveHomeFxRate({ type: "REAL" }, "THB", new Date())).resolves.toBe(1);
      expect(mockFetchQuote).not.toHaveBeenCalled();
    });

    it("REAL portfolios propagate a lookup failure", async () => {
      mockFetchQuote.mockRejectedValue(new Error("Yahoo is down"));
      await expect(fxService.resolveHomeFxRate({ type: "REAL" }, FROM, new Date())).rejects.toThrow();
    });

    it("PAPER portfolios degrade to null instead of throwing", async () => {
      mockFetchQuote.mockRejectedValue(new Error("Yahoo is down"));
      await expect(fxService.resolveHomeFxRate({ type: "PAPER" }, FROM, new Date())).resolves.toBeNull();
    });
  });
});
