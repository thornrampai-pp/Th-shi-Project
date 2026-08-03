import { builder } from "../../graphql/builder";
import { AssetService, AssetShape } from "./asset.service";

// กำหนด Asset Object Type โดยผูกกับ AssetShape
export const AssetRef = builder.objectRef<AssetShape>("Asset");
AssetRef.implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    symbol: t.exposeString("symbol"),
    name: t.exposeString("name"),
    type: t.exposeString("type"),
    currency: t.exposeString("currency"),
  }),
});

// Input สำหรับสร้าง Asset
export const CreateAssetInput = builder.inputType("CreateAssetInput", {
  fields: (t) => ({
    symbol: t.string({ required: true }),
    name: t.string({ required: true }),
    type: t.string({ required: true }),
    currency: t.string({ required: true }), 
  }),
});

// Queries
builder.queryFields((t) => ({
  getAssets: t.field({
    type: [AssetRef],
    resolve: async (): Promise<AssetShape[]> => {
      return await AssetService.getAssets();
    },
  }),
}));

// Mutations
builder.mutationFields((t) => ({
  createAsset: t.field({
    type: AssetRef,
    args: {
      input: t.arg({
        type: CreateAssetInput,
        required: true,
      }),
    },
    resolve: async (_parent, { input }, context: any): Promise<AssetShape> => {
      if (!context.userId) throw new Error("Unauthorized");

      const result = await AssetService.createAsset({
        symbol: input.symbol,
        name: input.name,
        type: input.type,
        currency: input.currency,
      });

      return result;
    },
  }),
}));