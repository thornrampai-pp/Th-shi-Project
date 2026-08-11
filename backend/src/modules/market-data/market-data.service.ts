import { prisma } from "../../lib/prisma";
import yahooFinance from "yahoo-finance2";

export interface UpsertAssetPriceInput {
  assetId: string;
  date: Date | string;
  closePrice: number;
  openPrice?: number | null;       // 🌟 แก้ไขตรงนี้ให้รองรับ undefined/null
  highPrice?: number | null;      // 🌟 แก้ไขตรงนี้ให้รองรับ undefined/null
  lowPrice?: number | null;       // 🌟 แก้ไขตรงนี้ให้รองรับ undefined/null
  volume?: bigint | number | null; // 🌟 แก้ไขตรงนี้ให้รองรับ undefined/null
}

export class MarketDataService {
  /**
   * ค้นหาหรือดึงรายการ Asset ทั้งหมด
   */
  static async searchAssets(keyword?: string) {
    const whereCondition = keyword
      ? {
          OR: [
            { symbol: { contains: keyword, mode: "insensitive" as const } },
            { name: { contains: keyword, mode: "insensitive" as const } },
          ],
        }
      : {};

    return await prisma.asset.findMany({
      where: whereCondition,
      take: 20,
    });
  }

  /**
   * บันทึกหรืออัปเดตราคาหุ้นรายวัน (Upsert)
   */
  static async upsertAssetPrice(input: UpsertAssetPriceInput) {
    const priceDate = new Date(input.date);
    priceDate.setHours(0, 0, 0, 0);

    const assetPrice = await prisma.assetPrice.upsert({
      where: {
        assetId_date: {
          assetId: input.assetId,
          date: priceDate,
        },
      },
      update: {
        closePrice: input.closePrice,
        openPrice: input.openPrice ?? null,
        highPrice: input.highPrice ?? null,
        lowPrice: input.lowPrice ?? null,
        volume: input.volume ? BigInt(input.volume) : null,
      },
      create: {
        assetId: input.assetId,
        date: priceDate,
        closePrice: input.closePrice,
        openPrice: input.openPrice ?? null,
        highPrice: input.highPrice ?? null,
        lowPrice: input.lowPrice ?? null,
        volume: input.volume ? BigInt(input.volume) : null,
      },
    });

    return {
      ...assetPrice,
      closePrice: Number(assetPrice.closePrice),
      openPrice: assetPrice.openPrice ? Number(assetPrice.openPrice) : null,
      highPrice: assetPrice.highPrice ? Number(assetPrice.highPrice) : null,
      lowPrice: assetPrice.lowPrice ? Number(assetPrice.lowPrice) : null,
      volume: assetPrice.volume ? Number(assetPrice.volume) : null,
    };
  }

  /**
   * ดึงประวัติราคาของสินทรัพย์ย้อนหลัง
   */
  static async getAssetPrices(assetId: string, limit = 30) {
    const prices = await prisma.assetPrice.findMany({
      where: { assetId },
      orderBy: { date: "desc" },
      take: limit,
    });

    return prices.map((p) => ({
      ...p,
      closePrice: Number(p.closePrice),
      openPrice: p.openPrice ? Number(p.openPrice) : null,
      highPrice: p.highPrice ? Number(p.highPrice) : null,
      lowPrice: p.lowPrice ? Number(p.lowPrice) : null,
      volume: p.volume ? Number(p.volume) : null,
    }));
  }

  /**
   * 🌟 ดึงข้อมูลราคาจาก Yahoo Finance ตาม Symbol และบันทึกลง DB อัตโนมัติ
   */
  static async syncPriceFromYahoo(
    assetId: string,
    symbol: string,
    startDate: string,
  ) {
    try {
      const results = (await yahooFinance.historical(symbol, {
        period1: startDate,
      })) as any[];

      let count = 0;
      for (const row of results) {
        if (!row.close) continue;

        await this.upsertAssetPrice({
          assetId,
          date: row.date,
          closePrice: row.close,
          openPrice: row.open ?? undefined,
          highPrice: row.high ?? undefined,
          lowPrice: row.low ?? undefined,
          volume: row.volume ?? undefined,
        });
        count++;
      }

      return {
        success: true,
        message: `Synced ${count} historical records for ${symbol}`,
        count,
      };
    } catch (error: any) {
      console.error(`Error syncing price from Yahoo for ${symbol}:`, error);
      throw new Error(
        `Failed to sync price from Yahoo Finance: ${error.message}`,
      );
    }
  }
}