/*
  Warnings:

  - A unique constraint covering the columns `[portfolioId,date,granularity]` on the table `PortfolioSnapshot` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "SnapshotPeriod" AS ENUM ('DAILY', 'MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "BacktestStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "SignalType" AS ENUM ('BUY', 'SELL', 'HOLD');

-- AlterEnum
ALTER TYPE "StrategyType" ADD VALUE 'QUANT_ALGO';

-- DropIndex
DROP INDEX "PortfolioSnapshot_portfolioId_date_idx";

-- DropIndex
DROP INDEX "PortfolioSnapshot_portfolioId_date_key";

-- AlterTable
ALTER TABLE "Portfolio" ADD COLUMN     "initialPaperBalance" DECIMAL(24,8),
ADD COLUMN     "paperCommissionRate" DECIMAL(8,6) DEFAULT 0.001,
ADD COLUMN     "paperSlippageBps" INTEGER DEFAULT 5;

-- AlterTable
ALTER TABLE "PortfolioSnapshot" ADD COLUMN     "granularity" "SnapshotPeriod" NOT NULL DEFAULT 'DAILY',
ADD COLUMN     "netCashFlow" DECIMAL(24,8) NOT NULL DEFAULT 0,
ADD COLUMN     "realizedPL" DECIMAL(24,8) NOT NULL DEFAULT 0,
ADD COLUMN     "totalDividend" DECIMAL(24,8) NOT NULL DEFAULT 0,
ADD COLUMN     "twrReturn" DECIMAL(10,6) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "BacktestRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "portfolioId" TEXT,
    "name" TEXT NOT NULL,
    "strategyKey" TEXT NOT NULL,
    "parameters" JSONB NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "initialCapital" DECIMAL(24,8) NOT NULL,
    "status" "BacktestStatus" NOT NULL DEFAULT 'PENDING',
    "totalReturn" DECIMAL(10,4),
    "cagr" DECIMAL(10,4),
    "sharpeRatio" DECIMAL(10,4),
    "maxDrawdown" DECIMAL(10,4),
    "winRate" DECIMAL(5,2),
    "totalTrades" INTEGER,
    "equityCurve" JSONB,
    "rawMetrics" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BacktestRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradingSignal" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "signalType" "SignalType" NOT NULL,
    "strength" DECIMAL(5,2),
    "price" DECIMAL(24,8) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'PYTHON_BOT',
    "metadata" JSONB,
    "isExecuted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradingSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BacktestRun_userId_createdAt_idx" ON "BacktestRun"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "BacktestRun_status_idx" ON "BacktestRun"("status");

-- CreateIndex
CREATE INDEX "TradingSignal_portfolioId_isExecuted_idx" ON "TradingSignal"("portfolioId", "isExecuted");

-- CreateIndex
CREATE INDEX "TradingSignal_assetId_createdAt_idx" ON "TradingSignal"("assetId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PortfolioSnapshot_portfolioId_granularity_date_idx" ON "PortfolioSnapshot"("portfolioId", "granularity", "date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioSnapshot_portfolioId_date_granularity_key" ON "PortfolioSnapshot"("portfolioId", "date", "granularity");

-- AddForeignKey
ALTER TABLE "BacktestRun" ADD CONSTRAINT "BacktestRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacktestRun" ADD CONSTRAINT "BacktestRun_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradingSignal" ADD CONSTRAINT "TradingSignal_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradingSignal" ADD CONSTRAINT "TradingSignal_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
