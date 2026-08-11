import { prisma } from "../../lib/prisma";

export class PositionService {
  /**
   * คำนวณและอัปเดต Position และ TaxLot ทุกครั้งที่มีการทำธุรกรรม BUY หรือ SELL
   */
  static async handleAssetTransaction(
    tx: any, // Prisma Transaction Client
    portfolioId: string,
    assetId: string,
    type: "BUY" | "SELL",
    quantity: number,
    price: number,
    transactionId: string,
  ) {
    const qty = Number(quantity);
    const prc = Number(price);

    // 1. ค้นหา Position ปัจจุบันของสินทรัพย์นี้ในพอร์ต
    let position = await tx.position.findUnique({
      where: {
        portfolioId_assetId: { portfolioId, assetId },
      },
    });

    if (type === "BUY") {
      if (!position) {
        // ถ้ายังไม่เคยมี Position ให้สร้างใหม่
        position = await tx.position.create({
          data: {
            portfolioId,
            assetId,
            quantity: qty,
            avgPrice: prc,
            realizedPL: 0,
            totalDiv: 0,
          },
        });
      } else {
        // ถ้ามีอยู่แล้ว คำนวณต้นทุนเฉลี่ยใหม่ (Weighted Average Cost)
        const currentQty = Number(position.quantity);
        const currentAvgPrice = Number(position.avgPrice);

        const newQty = currentQty + qty;
        const totalCost = currentQty * currentAvgPrice + qty * prc;
        const newAvgPrice = newQty > 0 ? totalCost / newQty : 0;

        position = await tx.position.update({
          where: { id: position.id },
          data: {
            quantity: newQty,
            avgPrice: newAvgPrice,
          },
        });
      }

      // 2. สร้าง TaxLot ใหม่สำหรับฝั่งซื้อ (FIFO Tracking)
      const currentYear = new Date().getFullYear();

      await tx.taxLot.create({
        data: {
          portfolioId,
          assetId,
          transactionId,
          remainingQty: qty,
          purchasePrice: prc,
          earnedYear: currentYear,
          executedAt: new Date(),
        },
      });
    } else if (type === "SELL") {
      if (!position || Number(position.quantity) < qty) {
        throw new Error("Insufficient position quantity to sell.");
      }

      let remainingQtyToSell = qty;
      let totalCostOfSold = 0;

      // 3. ดึง TaxLot ที่ยังเหลืออยู่เรียงตาม FIFO (ซื้อก่อน ขายก่อน)
      const openTaxLots = await tx.taxLot.findMany({
        where: {
          portfolioId,
          assetId,
          remainingQty: { gt: 0 },
        },
        orderBy: { executedAt: "asc" },
      });

      for (const lot of openTaxLots) {
        if (remainingQtyToSell <= 0) break;

        const lotRemaining = Number(lot.remainingQty);
        const lotPrice = Number(lot.purchasePrice);

        if (lotRemaining <= remainingQtyToSell) {
          // ขายหมดล็อตนี้
          totalCostOfSold += lotRemaining * lotPrice;
          remainingQtyToSell -= lotRemaining;

          await tx.taxLot.update({
            where: { id: lot.id },
            data: { remainingQty: 0 },
          });
        } else {
          // ขายตัดบางส่วนของล็อตนี้
          totalCostOfSold += remainingQtyToSell * lotPrice;
          const newLotRemaining = lotRemaining - remainingQtyToSell;
          remainingQtyToSell = 0;

          await tx.taxLot.update({
            where: { id: lot.id },
            data: { remainingQty: newLotRemaining },
          });
        }
      }

      // 4. คำนวณ Realized P/L (กำไร/ขาดทุนที่เกิดขึ้นจากการขาย)
      const totalRevenue = qty * prc;
      const realizedProfitLoss = totalRevenue - totalCostOfSold;

      const newQty = Number(position.quantity) - qty;
      const newRealizedPL = Number(position.realizedPL) + realizedProfitLoss;

      position = await tx.position.update({
        where: { id: position.id },
        data: {
          quantity: newQty,
          realizedPL: newRealizedPL,
          ...(newQty === 0 ? { avgPrice: 0 } : {}),
        },
      });
    }

    return position;
  }

  /**
   * ดึงข้อมูล Position ทั้งหมดในพอร์ต พร้อมข้อมูล Asset เพื่อนำไปแสดงผลหน้าจอ Portfolio
   */
  static async getPositions(portfolioId: string) {
    return await prisma.position.findMany({
      where: { portfolioId },
      include: {
        asset: true,
      },
    });
  }
}
