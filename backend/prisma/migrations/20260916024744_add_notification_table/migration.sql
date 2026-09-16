/*
  Warnings:

  - You are about to drop the column `createdAt` on the `AssetPrice` table. All the data in the column will be lost.
  - You are about to drop the column `date` on the `AssetPrice` table. All the data in the column will be lost.
  - You are about to drop the column `repeatAmountTHB` on the `TaxRecord` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[assetId,timestamp,timeframe]` on the table `AssetPrice` will be added. If there are existing duplicate values, this will fail.
  - Made the column `quarter` on table `AssetFundamental` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `timestamp` to the `AssetPrice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `convertedAmountTHB` to the `TaxRecord` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "OrderSide" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('MARKET', 'LIMIT');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "NotificationChannelType" AS ENUM ('DISCORD');

-- CreateEnum
CREATE TYPE "NotificationEventType" AS ENUM ('TRANSACTION_EXECUTED', 'ALERT_TRIGGERED', 'DAILY_SUMMARY', 'BACKTEST_COMPLETED', 'ORDER_FILLED');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- DropIndex
DROP INDEX "AssetPrice_assetId_date_idx";

-- DropIndex
DROP INDEX "AssetPrice_assetId_date_key";

-- AlterTable
ALTER TABLE "AssetFundamental" ADD COLUMN     "announcementDate" TIMESTAMP(3),
ALTER COLUMN "quarter" SET NOT NULL,
ALTER COLUMN "quarter" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "AssetPrice" DROP COLUMN "createdAt",
DROP COLUMN "date",
ADD COLUMN     "timeframe" TEXT NOT NULL DEFAULT '1D',
ADD COLUMN     "timestamp" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "TaxRecord" DROP COLUMN "repeatAmountTHB",
ADD COLUMN     "convertedAmountTHB" DECIMAL(18,2) NOT NULL;

-- CreateTable
CREATE TABLE "AssetIndicator" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "timeframe" TEXT NOT NULL DEFAULT '1D',
    "name" TEXT NOT NULL,
    "value" DECIMAL(18,6) NOT NULL,

    CONSTRAINT "AssetIndicator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "signalId" TEXT,
    "side" "OrderSide" NOT NULL,
    "orderType" "OrderType" NOT NULL DEFAULT 'MARKET',
    "quantity" DECIMAL(24,8) NOT NULL,
    "limitPrice" DECIMAL(24,8),
    "filledQty" DECIMAL(24,8) NOT NULL DEFAULT 0,
    "avgFillPrice" DECIMAL(24,8),
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "filledAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "transactionId" TEXT,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationChannel" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationChannelType" NOT NULL DEFAULT 'DISCORD',
    "label" TEXT,
    "webhookUrl" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "events" "NotificationEventType"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "eventType" "NotificationEventType" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssetIndicator_assetId_name_timestamp_idx" ON "AssetIndicator"("assetId", "name", "timestamp" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "AssetIndicator_assetId_name_timeframe_timestamp_key" ON "AssetIndicator"("assetId", "name", "timeframe", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "Order_transactionId_key" ON "Order"("transactionId");

-- CreateIndex
CREATE INDEX "Order_portfolioId_status_idx" ON "Order"("portfolioId", "status");

-- CreateIndex
CREATE INDEX "Order_assetId_idx" ON "Order"("assetId");

-- CreateIndex
CREATE INDEX "NotificationChannel_userId_idx" ON "NotificationChannel"("userId");

-- CreateIndex
CREATE INDEX "NotificationLog_channelId_createdAt_idx" ON "NotificationLog"("channelId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AssetPrice_assetId_timeframe_timestamp_idx" ON "AssetPrice"("assetId", "timeframe", "timestamp" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "AssetPrice_assetId_timestamp_timeframe_key" ON "AssetPrice"("assetId", "timestamp", "timeframe");

-- CreateIndex
CREATE INDEX "TaxLot_transactionId_idx" ON "TaxLot"("transactionId");

-- AddForeignKey
ALTER TABLE "AssetIndicator" ADD CONSTRAINT "AssetIndicator_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxLot" ADD CONSTRAINT "TaxLot_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "TradingSignal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationChannel" ADD CONSTRAINT "NotificationChannel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "NotificationChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
