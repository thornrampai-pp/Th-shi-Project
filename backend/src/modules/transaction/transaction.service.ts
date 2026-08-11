import { prisma } from "../../lib/prisma";
import { TransactionType, AccountType, EntrySide } from "@prisma/client";
import { PositionService } from "../position/position.service";

export class TransactionService {
  static async getTransaction(portfolioId: string) {
    return await prisma.transaction.findMany({
      where: {
        portfolioId: portfolioId,
      },
      include: {
        slipVerification: true,
        ledgerEntries: true,
      },
      orderBy: {
        executedAt: "desc",
      },
    });
  }

  static async createAssetTransaction(
    portfolioId: string,
    input: {
      assetId: string;
      type: "BUY" | "SELL";
      quantity: number;
      price: number;
      fee?: number | undefined;
      taxWithheld?: number | undefined;
      executedAt?: string | undefined;
      slipVerification?: any;
    },
  ) {
    const qty = Number(input.quantity);
    const prc = Number(input.price);
    const numericFee = Number(input.fee || 0);
    const numericTax = Number(input.taxWithheld || 0);

    // ถ้าซื้อ: จ่ายเงินเพิ่ม (Quantity * Price + Fee + Tax)
    // ถ้าขาย: ได้รับเงินสุทธิ (Quantity * Price - Fee - Tax)
    const totalAmount =
      input.type === "BUY"
        ? qty * prc + numericFee + numericTax
        : qty * prc - numericFee - numericTax;

    return await prisma.$transaction(async (tx) => {
      const asset = await tx.asset.findUnique({ where: { id: input.assetId } });
      if (!asset) throw new Error("Asset not found.");

      let cashAccount = await tx.cashAccount.findFirst({
        where: { portfolioId, currency: asset.currency },
      });

      if (!cashAccount)
        throw new Error(
          `Cash account for currency ${asset.currency} not found.`,
        );

      // ตรวจสอบเงินสดคงเหลือกรณีซื้อ
      if (input.type === "BUY" && Number(cashAccount.balance) < totalAmount) {
        throw new Error("Insufficient cash to buy this asset.");
      }

      // 1. บันทึก Transaction
      const transaction = await tx.transaction.create({
        data: {
          portfolioId,
          type: input.type as TransactionType,
          status: "COMPLETED",
          executedAt: input.executedAt
            ? new Date(input.executedAt)
            : new Date(),
          mainAssetId: input.assetId,
          mainQuantity: qty,
          mainPrice: prc,
          baseCurrAmount: Math.abs(totalAmount),
          fee: numericFee,
          taxWithheld: numericTax,
          ...(input.slipVerification && {
            slipVerification: {
              create: {
                imageUrl: input.slipVerification.imageUrl,
                transRef: input.slipVerification.transRef,
                ...(input.slipVerification.sendingBank && {
                  sendingBank: input.slipVerification.sendingBank,
                }),
                ...(input.slipVerification.senderName && {
                  senderName: input.slipVerification.senderName,
                }),
                amount: input.slipVerification.amount
                  ? Number(input.slipVerification.amount)
                  : Math.abs(totalAmount),
                currency: input.slipVerification.currency || asset.currency,
                fee: input.slipVerification.fee
                  ? Number(input.slipVerification.fee)
                  : undefined,
                vat: input.slipVerification.vat
                  ? Number(input.slipVerification.vat)
                  : undefined,
                netAmount: Math.abs(totalAmount),
                isAmountMatched: true,
              },
            },
          }),
        },
        include: { slipVerification: true },
      });

      // 2. อัปเดตยอดเงินสดในพอร์ต (ซื้อ = เงินลด, ขาย = เงินเพิ่ม)
      const newCashBalance =
        input.type === "BUY"
          ? Number(cashAccount.balance) - totalAmount
          : Number(cashAccount.balance) + totalAmount;

      await tx.cashAccount.update({
        where: { id: cashAccount.id },
        data: { balance: newCashBalance },
      });

      // 3. บันทึก Double-Entry Ledger
      await tx.ledgerEntry.createMany({
        data: [
          {
            transactionId: transaction.id,
            portfolioId,
            cashAccountId: cashAccount.id,
            accountType: AccountType.CASH,
            side: input.type === "BUY" ? EntrySide.CREDIT : EntrySide.DEBIT,
            amount: Math.abs(totalAmount),
            assetSymbol: asset.symbol,
          },
          {
            transactionId: transaction.id,
            portfolioId,
            accountType: AccountType.ASSET,
            side: input.type === "BUY" ? EntrySide.DEBIT : EntrySide.CREDIT,
            amount: qty * prc,
            assetSymbol: asset.symbol,
          },
        ],
      });

      // 4. 🌟 เรียกใช้ PositionService เพื่อคำนวณต้นทุนเฉลี่ยและตัด TaxLot (FIFO) อัตโนมัติ
      await PositionService.handleAssetTransaction(
        tx,
        portfolioId,
        input.assetId,
        input.type,
        qty,
        prc,
        transaction.id,
      );

      return transaction;
    });
  }
}
