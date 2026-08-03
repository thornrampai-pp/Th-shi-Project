import { prisma } from "../../lib/prisma";
import { TransactionType, AccountType, EntrySide } from "@prisma/client";

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
    const totalCost = qty * prc + numericFee + numericTax;

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

      if (input.type === "BUY" && Number(cashAccount.balance) < totalCost) {
        throw new Error("Insufficient cash to buy this asset.");
      }

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
          baseCurrAmount: totalCost,
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
                amount: input.slipVerification.amount
                  ? Number(input.slipVerification.amount)
                  : totalCost,
                currency: input.slipVerification.currency || asset.currency,
                isAmountMatched: true,
              },
            },
          }),
        },
        include: { slipVerification: true },
      });

      const newCashBalance =
        input.type === "BUY"
          ? Number(cashAccount.balance) - totalCost
          : Number(cashAccount.balance) + totalCost;

      await tx.cashAccount.update({
        where: { id: cashAccount.id },
        data: { balance: newCashBalance },
      });

      await tx.ledgerEntry.createMany({
        data: [
          {
            transactionId: transaction.id,
            portfolioId,
            cashAccountId: cashAccount.id,
            accountType: AccountType.CASH,
            side: input.type === "BUY" ? EntrySide.CREDIT : EntrySide.DEBIT,
            amount: totalCost,
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

      return transaction;
    });
  }
}
