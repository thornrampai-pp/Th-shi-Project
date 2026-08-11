import { builder } from "../../graphql/builder";
import { TransactionService } from "./transaction.service";
import { SlipVerificationInputRef, TransactionRef, TransactionShape } from "../cash/cash.schema";

builder.mutationFields((t) => ({
  createAssetTransaction: t.field({
    type: TransactionRef,
    nullable: true,
    args: {
      portfolioId: t.arg.id({ required: true }),
      assetId: t.arg.id({ required: true }),
      type: t.arg.string({ required: true }), // BUY หรือ SELL
      quantity: t.arg.float({ required: true }),
      price: t.arg.float({ required: true }),
      fee: t.arg.float({ required: false }),
      taxWithheld: t.arg.float({ required: false }),
      executedAt: t.arg.string({ required: false }),
      slipVerification: t.arg({
        type: SlipVerificationInputRef,
        required: false,
      }),
    },
    resolve: async (_parent, args, context: any) => {
      if (!context.userId) throw new Error("Unauthorized");
      
      const result = await TransactionService.createAssetTransaction(
        args.portfolioId,
        {
          assetId: args.assetId,
          type: args.type as any,
          quantity: args.quantity,
          price: args.price,
          fee: args.fee ?? undefined,
          taxWithheld: args.taxWithheld ?? undefined,
          executedAt: args.executedAt ?? undefined,
          slipVerification: args.slipVerification ?? undefined,
        },
      );

      return result as unknown as TransactionShape;
    },
  }),
}));

builder.queryFields((t) => ({
  getTransactions: t.field({
    type: [TransactionRef],
    args: {
      portfolioId: t.arg.id({ required: true }),
    },
    resolve: async (_parent, { portfolioId }, context: any) => {
      if (!context.userId) throw new Error("Unauthorized");
      
      const result = await TransactionService.getTransaction(portfolioId);
      return result as unknown as TransactionShape[];
    },
  }),
}));