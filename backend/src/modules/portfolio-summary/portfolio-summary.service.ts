import { prisma } from "../../lib/prisma";

export interface AssetSummaryDto {
  assetSymbol: string;
  assetName: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  currentValue: number;
  costValue: number;
  unrealizedPL: number;
  unrealizedPLPercent: number;
  realizedPL: number;
  totalDiv: number;
}

export interface PortfolioSummaryResponse {
  totalCurrentValue: number;
  totalCost: number;
  totalUnrealizedPL: number;
  totalUnrealizedPLPercent: number;
  totalRealizedPL: number;
  totalDividend: number;
  netTotalProfit: number;
  holdings: AssetSummaryDto[];
}

export class PortfolioSummaryService {
  /**
   * คำนวณภาพรวมพอร์ต: มูลค่ารวม, ต้นทุนรวม, Unrealized P/L และ Realized P/L
   */
  static async getPortfolioSummary(portfolioId: string): Promise<PortfolioSummaryResponse> {
    // 1. ดึงข้อมูล Positions ทั้งหมดในพอร์ต พร้อมราคาปัจจุบันล่าสุดของ Asset
    const positions = await prisma.position.findMany({
      where: { portfolioId },
      include: {
        asset: {
          include: {
            prices: {
              orderBy: { date: "desc" },
              take: 1, // ดึงราคาล่าสุด
            },
          },
        },
      },
    });

    let totalCurrentValue = 0;
    let totalCost = 0;
    let totalRealizedPL = 0;
    let totalDividend = 0;

    const assetSummaries: AssetSummaryDto[] = positions.map((pos) => {
      const qty = Number(pos.quantity);
      const avgPrice = Number(pos.avgPrice);
      const realizedPL = Number(pos.realizedPL);
      const div = Number(pos.totalDiv);

      // 🌟 ใช้ Optional Chaining (?.) เพื่อป้องกัน Error Object is possibly 'undefined'
      const latestPriceRecord = pos.asset.prices[0];
      const latestPrice = latestPriceRecord?.closePrice ? Number(latestPriceRecord.closePrice) : avgPrice;
      
      const currentValue = qty * latestPrice;
      const costValue = qty * avgPrice;
      const unrealizedPL = currentValue - costValue;
      const unrealizedPLPercent = costValue > 0 ? (unrealizedPL / costValue) * 100 : 0;

      totalCurrentValue += currentValue;
      totalCost += costValue;
      totalRealizedPL += realizedPL;
      totalDividend += div;

      return {
        assetSymbol: pos.asset.symbol,
        assetName: pos.asset.name,
        quantity: qty,
        avgPrice,
        currentPrice: latestPrice,
        currentValue,
        costValue,
        unrealizedPL,
        unrealizedPLPercent,
        realizedPL,
        totalDiv: div,
      };
    });

    const totalUnrealizedPL = totalCurrentValue - totalCost;
    const totalUnrealizedPLPercent = totalCost > 0 ? (totalUnrealizedPL / totalCost) * 100 : 0;
    const netTotalProfit = totalUnrealizedPL + totalRealizedPL + totalDividend;

    return {
      totalCurrentValue,
      totalCost,
      totalUnrealizedPL,
      totalUnrealizedPLPercent,
      totalRealizedPL,
      totalDividend,
      netTotalProfit,
      holdings: assetSummaries,
    };
  }
}