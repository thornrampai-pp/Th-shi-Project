/*
  Warnings:

  - A unique constraint covering the columns `[assetId,period,year,quarter]` on the table `AssetFundamental` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "DataPeriod" AS ENUM ('QUARTERLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "ThesisStatus" AS ENUM ('DRAFT', 'WATCHING', 'ACTIVE', 'ARCHIVED');

-- DropIndex
DROP INDEX "AssetFundamental_assetId_quarter_year_key";

-- AlterTable
ALTER TABLE "AssetFundamental" ADD COLUMN     "currentRatio" DECIMAL(10,2),
ADD COLUMN     "freeCashFlow" DECIMAL(24,8),
ADD COLUMN     "grossMargin" DECIMAL(5,2),
ADD COLUMN     "netMargin" DECIMAL(5,2),
ADD COLUMN     "period" "DataPeriod" NOT NULL DEFAULT 'QUARTERLY',
ADD COLUMN     "profitGrowth" DECIMAL(5,2),
ADD COLUMN     "psRatio" DECIMAL(10,2),
ADD COLUMN     "revenue" DECIMAL(24,8),
ADD COLUMN     "revenueGrowth" DECIMAL(5,2),
ADD COLUMN     "roa" DECIMAL(5,2),
ADD COLUMN     "roe" DECIMAL(5,2),
ALTER COLUMN "quarter" DROP NOT NULL;

-- CreateTable
CREATE TABLE "InvestmentThesis" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "portfolioId" TEXT,
    "status" "ThesisStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "entryPrice" DECIMAL(24,8),
    "targetPrice" DECIMAL(24,8),
    "stopLoss" DECIMAL(24,8),
    "timeHorizon" TEXT,
    "catalysts" TEXT,
    "risks" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvestmentThesis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvestmentThesis_userId_assetId_idx" ON "InvestmentThesis"("userId", "assetId");

-- CreateIndex
CREATE INDEX "InvestmentThesis_userId_status_idx" ON "InvestmentThesis"("userId", "status");

-- CreateIndex
CREATE INDEX "Asset_sector_idx" ON "Asset"("sector");

-- CreateIndex
CREATE INDEX "Asset_type_idx" ON "Asset"("type");

-- CreateIndex
CREATE INDEX "AssetFundamental_isLatest_peRatio_roe_dividendYield_debtToE_idx" ON "AssetFundamental"("isLatest", "peRatio", "roe", "dividendYield", "debtToEquity");

-- CreateIndex
CREATE UNIQUE INDEX "AssetFundamental_assetId_period_year_quarter_key" ON "AssetFundamental"("assetId", "period", "year", "quarter");

-- AddForeignKey
ALTER TABLE "InvestmentThesis" ADD CONSTRAINT "InvestmentThesis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentThesis" ADD CONSTRAINT "InvestmentThesis_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentThesis" ADD CONSTRAINT "InvestmentThesis_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
