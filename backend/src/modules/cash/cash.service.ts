import { prisma } from "../../config/prisma";
import { TransactionType, AccountType, EntrySide } from "@prisma/client";

export class CashService {
  static async getCashAccounts(portfolioId: string) {
    return await prisma.cashAccount.findMany({
      where: {
        portfolioId,
      },
    });
  }

  static async createCashTransaction(
    portfolioId: string,
    input: {
      amount: number;
      currency: string;
      type: "DEPOSIT" | "WITHDRAW";
      executedAt?: string | undefined;
      slipVerification?: {
        imageUrl: string;
        transRef: string;
        sendingBank?: string;
        senderName?: string;
        amount?: number;
        currency?: string;
        fee?: number; // <-- เพิ่มเข้ามา
        vat?: number; // <-- เพิ่มเข้ามา
      };
    },
  ) {
    const numericAmount = Number(input.amount);

    return await prisma.$transaction(async (tx) => {
      let cashAccount = await tx.cashAccount.findFirst({
        where: {
          portfolioId,
          currency: input.currency,
        },
      });

      if (!cashAccount && input.type === "DEPOSIT") {
        cashAccount = await tx.cashAccount.create({
          data: {
            portfolioId,
            currency: input.currency,
            balance: 0,
            isDomestic: input.currency === "THB",
          },
        });
      }
      if (!cashAccount) {
        throw new Error("Cash account not found for this currency.");
      }

      if (
        input.type === "WITHDRAW" &&
        Number(cashAccount.balance) < numericAmount
      ) {
        throw new Error("Insufficient cash balance.");
      }

      // คำนวณ Net Amount (ถ้ามี fee หรือ vat นำมาหักออก หรือปรับใช้ตาม business logic ของคุณ)
      const fee = input.slipVerification?.fee
        ? Number(input.slipVerification.fee)
        : 0;
      const vat = input.slipVerification?.vat
        ? Number(input.slipVerification.vat)
        : 0;
      const netAmount = numericAmount - fee - vat; // ตัวอย่างสูตรคำนวนยอดสุทธิ

      const transaction = await tx.transaction.create({
        data: {
          portfolioId,
          type: input.type as TransactionType,
          status: "COMPLETED",
          executedAt: input.executedAt
            ? new Date(input.executedAt)
            : new Date(),
          baseCurrAmount: numericAmount,
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
                amount: numericAmount,
                currency: input.currency,
                // --- บันทึกข้อมูล fee, vat, netAmount ลง DB ---
                ...(fee > 0 && { fee }),
                ...(vat > 0 && { vat }),
                netAmount: netAmount,
                // ---------------------------------------------
                isAmountMatched: true,
              },
            },
          }),
        },
        include: { slipVerification: true },
      });

      // 6. อัปเดตยอดเงินใน CashAccount (แนะนำให้ใช้ netAmount หรือ numericAmount ตามดีไซน์ระบบของคุณ)
      const newBalance =
        input.type === "DEPOSIT"
          ? Number(cashAccount.balance) + numericAmount
          : Number(cashAccount.balance) - numericAmount;

      await tx.cashAccount.update({
        where: { id: cashAccount.id },
        data: { balance: newBalance },
      });

      // 7. บันทึก Double-Entry Ledger
      await tx.ledgerEntry.create({
        data: {
          transactionId: transaction.id,
          portfolioId,
          cashAccountId: cashAccount.id,
          accountType: AccountType.CASH,
          side: input.type === "DEPOSIT" ? EntrySide.DEBIT : EntrySide.CREDIT,
          amount: numericAmount,
          assetSymbol: input.currency,
        },
      });

      return transaction;
    });
  }
}
