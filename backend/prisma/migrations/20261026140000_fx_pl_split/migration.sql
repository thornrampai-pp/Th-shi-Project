-- Split realized P/L into stock-price and FX components (home currency = THB).
-- Existing positions start at 0: sells recorded before this migration have no split.

-- AlterTable
ALTER TABLE "Position" ADD COLUMN     "realizedFxPLHome" DECIMAL(24,8) NOT NULL DEFAULT 0,
ADD COLUMN     "realizedPLHome" DECIMAL(24,8) NOT NULL DEFAULT 0,
ADD COLUMN     "realizedStockPLHome" DECIMAL(24,8) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "TaxLot" ADD COLUMN     "purchaseFxRate" DECIMAL(18,6);
