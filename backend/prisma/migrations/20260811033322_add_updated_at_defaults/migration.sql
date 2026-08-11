/*
  Warnings:

  - Added the required column `updatedAt` to the `Alert` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Asset` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Transaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `WatchList` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Alert" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "AssetPrice" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "closePrice" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "openPrice" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "highPrice" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "lowPrice" SET DATA TYPE DECIMAL(18,4);

-- AlterTable
ALTER TABLE "DividendAnnouncement" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "LedgerEntry" ADD COLUMN     "assetId" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "PortfolioSnapshot" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "TaxLot" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "TaxRecord" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "WatchList" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "fromCurrency" TEXT NOT NULL,
    "toCurrency" TEXT NOT NULL,
    "rate" DECIMAL(18,6) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExchangeRate_fromCurrency_toCurrency_date_idx" ON "ExchangeRate"("fromCurrency", "toCurrency", "date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_fromCurrency_toCurrency_date_key" ON "ExchangeRate"("fromCurrency", "toCurrency", "date");

-- CreateIndex
CREATE INDEX "Asset_symbol_idx" ON "Asset"("symbol");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "DividendAnnouncement_assetId_exDate_idx" ON "DividendAnnouncement"("assetId", "exDate");

-- CreateIndex
CREATE INDEX "LedgerEntry_portfolioId_idx" ON "LedgerEntry"("portfolioId");

-- CreateIndex
CREATE INDEX "LedgerEntry_assetId_idx" ON "LedgerEntry"("assetId");

-- CreateIndex
CREATE INDEX "PortfolioSnapshot_portfolioId_date_idx" ON "PortfolioSnapshot"("portfolioId", "date" DESC);

-- CreateIndex
CREATE INDEX "Position_portfolioId_idx" ON "Position"("portfolioId");

-- CreateIndex
CREATE INDEX "TaxLot_portfolioId_assetId_executedAt_idx" ON "TaxLot"("portfolioId", "assetId", "executedAt" ASC);

-- CreateIndex
CREATE INDEX "TaxRecord_portfolioId_taxYear_idx" ON "TaxRecord"("portfolioId", "taxYear");

-- CreateIndex
CREATE INDEX "Transaction_type_idx" ON "Transaction"("type");

-- CreateIndex
CREATE INDEX "WatchList_userId_idx" ON "WatchList"("userId");

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;