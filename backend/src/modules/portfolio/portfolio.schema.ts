import { builder } from "../../graphql/builder";
import { PortfolioService } from "./portfolio.service";
import { PortfolioType, StrategyType } from "@prisma/client";

builder.enumType("StrategyType", {
  values: ["VALUE", "GROWTH", "DIVIDEND", "TRADING" as const],
});

builder.enumType("PortfolioType", {
  values: ["REAL", "PAPER" as const],
});

// กำหนด Object Types
const TagRef = builder.objectRef<{ id: string; name: string; color: string }>(
  "Tag",
);
TagRef.implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    name: t.exposeString("name"),
    color: t.exposeString("color"),
  }),
});

// นิยาม CashAccount Object Type
const CashAccountRef = builder.objectRef<{
  id: string;
  currency: string;
  balance: any;
  isDefault: boolean;
}>("CashAccount");
CashAccountRef.implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    currency: t.exposeString("currency"),
    balance: t.field({
      type: "Float",
      resolve: (parent) => Number(parent.balance),
    }),
    isDefault: t.exposeBoolean("isDefault"),
  }),
});

// นิยาม PortfolioTag (Relation) Object Type
const PortfolioTagRef = builder.objectRef<{
  tag: { id: string; name: string; color: string };
}>("PortfolioTag");
PortfolioTagRef.implement({
  fields: (t) => ({
    tag: t.field({
      type: TagRef,
      resolve: (parent) => parent.tag,
    }),
  }),
});

// นิยาม Portfolio Object Type หลัก
const PortfolioRef = builder.objectRef<any>("Portfolio");
PortfolioRef.implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    name: t.exposeString("name"),
    description: t.exposeString("description", { nullable: true }), // 🌟 เพิ่มตรงนี้
    imageUrl: t.exposeString("imageUrl", { nullable: true }),
    strategy: t.exposeString("strategy"),
    baseCurrency: t.exposeString("baseCurrency"),
    isMargin: t.exposeBoolean("isMargin"),
    type: t.exposeString("type"),
    cashAccounts: t.field({
      type: [CashAccountRef],
      resolve: (parent) => parent.cashAccounts,
    }),
    tags: t.field({
      type: [PortfolioTagRef],
      resolve: (parent) => parent.tags,
    }),
  }),
});

// Queries
builder.queryFields((t) => ({
  getTags: t.field({
    type: [TagRef],
    resolve: async () => await PortfolioService.getTags(),
  }),
  getPortfolios: t.field({
    type: [PortfolioRef],
    resolve: async (_parent, _args, context: any) => {
      if (!context.userId) throw new Error("User not authenticated");
      return await PortfolioService.getPortfolios(context.userId);
    },
  }),
}));

// Input Type สำหรับสร้าง Portfolio
const CreatePortfolioInput = builder.inputType("CreatePortfolioInput", {
  fields: (t) => ({
    name: t.string({ required: true }),
    description: t.string(),
    imageUrl: t.string(),
    strategy: t.string({ required: true }),
    baseCurrency: t.string({ required: true }),
    isMargin: t.boolean({ required: true }),
    type: t.string({ required: true }),
    tagIds: t.idList(),
  }),
});

// Mutations (รวมทุก Mutation ไว้ในบล็อกเดียว ป้องกันการประกาศซ้ำ)
builder.mutationFields((t) => ({
  createTag: t.field({
    type: TagRef,
    args: {
      name: t.arg.string({ required: true }),
      color: t.arg.string({ required: false }),
    },
    resolve: async (_parent, { name, color }) => {
      return await PortfolioService.createTag(name, color || undefined);
    },
  }),

  createPortfolio: t.field({
    type: PortfolioRef,
    args: {
      input: t.arg({
        type: CreatePortfolioInput,
        required: true,
      }),
    },
    resolve: async (_parent, { input }, context: any) => {
      if (!context.userId) {
        throw new Error("Unauthorized");
      }

      const result = await PortfolioService.createPortfolio(context.userId, {
        name: input.name,
        ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
        strategy: input.strategy as StrategyType,
        baseCurrency: input.baseCurrency,
        isMargin: input.isMargin,
        type: input.type as PortfolioType,
        tagIds: input.tagIds ?? [],
      });

      return result as any;
    },
  }),

  resetPortfolio: t.field({
    type: "Boolean",
    args: {
      portfolioId: t.arg.id({ required: true }),
    },
    resolve: async (_parent, { portfolioId }, context: any) => {
      if (!context.userId) {
        throw new Error("Unauthorized");
      }

      return await PortfolioService.resetPortfolio(portfolioId);
    },
  }),
}));
