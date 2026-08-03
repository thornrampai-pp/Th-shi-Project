import { builder } from "../../graphql/builder";
import { CashService } from "./cash.service";

// 🌟 1. ประกาศ TypeScript Type สำหรับข้อมูลที่จะส่งออกผ่าน GraphQL
export interface SlipVerificationShape {
  id: string;
  imageUrl: string;
  transRef: string;
  sendingBank?: string | null;
  receivingBank?: string | null;
  senderName?: string | null;
  amount: any;
  currency: string;
}

export interface TransactionShape {
  id: string;
  type: string;
  status: string;
  baseCurrAmount: any;
  executedAt: Date;
  slipVerification?: SlipVerificationShape | null;
}

// 2. นิยาม SlipVerification Object Type โดยกำหนด Type Shape กำกับ
export const SlipVerificationRef = builder.objectRef<SlipVerificationShape>("SlipVerification");
SlipVerificationRef.implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    imageUrl: t.exposeString("imageUrl"),
    transRef: t.exposeString("transRef"),
    sendingBank: t.exposeString("sendingBank", { nullable: true }),
    receivingBank: t.exposeString("receivingBank", { nullable: true }),
    senderName: t.exposeString("senderName", { nullable: true }),
    amount: t.field({
      type: "Float",
      resolve: (parent) => Number(parent.amount),
    }),
    currency: t.exposeString("currency"),
  }),
});

// 3. นิยาม Transaction Object Type โดยกำหนด Type Shape กำกับ
export const TransactionRef = builder.objectRef<TransactionShape>("Transaction");
TransactionRef.implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    type: t.exposeString("type"),
    status: t.exposeString("status"),
    baseCurrAmount: t.field({
      type: "Float",
      resolve: (parent) => Number(parent.baseCurrAmount),
    }),
    executedAt: t.field({
      type: "String",
      resolve: (parent) => parent.executedAt.toISOString(),
    }),
    slipVerification: t.field({
      type: SlipVerificationRef,
      nullable: true,
      resolve: (parent) => parent.slipVerification,
    }),
  }),
});

// 4. นิยาม Input Type สำหรับรับข้อมูลสลิป
export const SlipVerificationInputRef = builder.inputType("SlipVerificationInput", {
  fields: (t) => ({
    imageUrl: t.string({ required: true }),
    transRef: t.string({ required: true }),
    sendingBank: t.string({ required: false }),
    receivingBank: t.string({ required: false }),
    senderName: t.string({ required: false }),
    amount: t.float({ required: false }),
    currency: t.string({ required: false }),
  }),
});

// 5. นำ Mutation มาผูกกับ Builder
builder.mutationFields((t) => ({
  createCashTransaction: t.field({
    type: TransactionRef,
    nullable: true,
    args: {
      portfolioId: t.arg.id({ required: true }),
      amount: t.arg.float({ required: true }),
      currency: t.arg.string({ required: true }),
      type: t.arg.string({ required: true }),
      executedAt: t.arg.string({ required: false }),
      slipVerification: t.arg({
        type: SlipVerificationInputRef,
        required: false,
      }),
    },
    resolve: async (_parent, args, context: any) => {
      if (!context.userId) throw new Error("Unauthorized");
      
      // ใช้ Type Assertion ตรงนี้เพื่อบอก TS ว่าผลลัพธ์ตรงกับ TransactionShape แน่นอน
      const result = await CashService.createCashTransaction(args.portfolioId, {
        amount: args.amount,
        currency: args.currency,
        type: args.type as any,
        executedAt: args.executedAt || undefined,
        slipVerification: args.slipVerification as any,
      });

      return result as unknown as TransactionShape;
    },
  }),
}));