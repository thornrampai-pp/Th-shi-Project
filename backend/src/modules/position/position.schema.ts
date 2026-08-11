import { builder } from "../../graphql/builder";
import { PositionService } from "./position.service";
import { AssetRef } from "../asset/asset.schema";

// 1. นิยาม Position Object Type
const PositionRef = builder.objectRef<any>("Position");
PositionRef.implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    quantity: t.field({
      type: "Float",
      resolve: (parent) => Number(parent.quantity),
    }),
    avgPrice: t.field({
      type: "Float",
      resolve: (parent) => Number(parent.avgPrice),
    }),
    realizedPL: t.field({
      type: "Float",
      resolve: (parent) => Number(parent.realizedPL),
    }),
    totalDiv: t.field({
      type: "Float",
      resolve: (parent) => Number(parent.totalDiv),
    }),
    asset: t.field({
      type: AssetRef,
      resolve: (parent) => parent.asset,
    }),
  }),
});

// 2. Query สำหรับดึง Position ทั้งหมดในพอร์ต
builder.queryFields((t) => ({
  getPositions: t.field({
    type: [PositionRef],
    args: {
      portfolioId: t.arg.id({ required: true }),
    },
    resolve: async (_parent, { portfolioId }, context: any) => {
      if (!context.userId) throw new Error("Unauthorized");
      return await PositionService.getPositions(portfolioId);
    },
  }),
}));