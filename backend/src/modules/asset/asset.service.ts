import { prisma } from "../../config/prisma";
import { AssetType } from "@prisma/client";

export interface CreateAssetInputShape {
  symbol: string;
  name: string;
  type: string;
  currency: string;
}

export interface AssetShape {
  id: string;
  symbol: string;
  name: string;
  type: string;
  currency: string;
}

export class AssetService {
  static async createAsset(input: CreateAssetInputShape): Promise<AssetShape> {
    const asset = await prisma.asset.create({
      data: {
        symbol: input.symbol,
        name: input.name,
        type: input.type as AssetType,
        currency: input.currency,
      },
    });

    return {
      id: asset.id,
      symbol: asset.symbol,
      name: asset.name,
      type: asset.type,
      currency: asset.currency,
    };
  }

  static async getAssets(): Promise<AssetShape[]> {
    const assets = await prisma.asset.findMany();
    return assets.map((asset) => ({
      id: asset.id,
      symbol: asset.symbol,
      name: asset.name,
      type: asset.type,
      currency: asset.currency
    }));
  }
}