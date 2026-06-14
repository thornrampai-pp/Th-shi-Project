-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "StrategyType" AS ENUM ('VALUE', 'GROWTH', 'DIVIDEND', 'TRADING');

-- CreateEnum
CREATE TYPE "PortfolioType" AS ENUM ('REAL', 'PAPER');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('CASH', 'ASSET');

-- CreateEnum
CREATE TYPE "EntrySide" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('STOCK', 'ETF', 'CRYPTO', 'FOREX', 'GOLD');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('BUY', 'SELL', 'DEPOSIT', 'WITHDRAW', 'DIVIDEND', 'REPATRIATION', 'FEE', 'TAX', 'SPLIT');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REVERSED');

-- CreateEnum
CREATE TYPE "TaxType" AS ENUM ('PERSONAL_INCOME', 'CAPITAL_GAIN', 'WITHHOLDING');

-- CreateEnum
CREATE TYPE "TaxStatus" AS ENUM ('PENDING', 'FILED', 'PAID');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "firstName" TEXT,
    "lastName" TEXT,
    "imageUrl" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "taxResidency" TEXT NOT NULL DEFAULT 'TH',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Portfolio" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT,
    "strategy" "StrategyType" NOT NULL DEFAULT 'VALUE',
    "baseCurrency" TEXT NOT NULL DEFAULT 'THB',
    "isMargin" BOOLEAN NOT NULL DEFAULT false,
    "type" "PortfolioType" NOT NULL DEFAULT 'REAL',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Portfolio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioTag" (
    "portfolioId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "PortfolioTag_pkey" PRIMARY KEY ("portfolioId","tagId")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#000000',

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashAccount" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "balance" DECIMAL(24,8) NOT NULL DEFAULT 0,
    "isDomestic" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "cashAccountId" TEXT,
    "positionId" TEXT,
    "accountType" "AccountType" NOT NULL,
    "side" "EntrySide" NOT NULL,
    "amount" DECIMAL(24,8) NOT NULL,
    "assetSymbol" TEXT NOT NULL,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AssetType" NOT NULL,
    "currency" TEXT NOT NULL,
    "exchange" TEXT NOT NULL DEFAULT 'GLOBAL',

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetFundamental" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "quarter" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "isLatest" BOOLEAN NOT NULL DEFAULT false,
    "peRatio" DECIMAL(10,2),
    "pbvRatio" DECIMAL(10,2),
    "debtToEquity" DECIMAL(10,2),
    "netProfit" DECIMAL(24,8),
    "dividendYield" DECIMAL(5,2),
    "healthScore" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetFundamental_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DividendAnnouncement" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "exDate" TIMESTAMP(3) NOT NULL,
    "payDate" TIMESTAMP(3),
    "amount" DECIMAL(18,8) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'THB',

    CONSTRAINT "DividendAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'COMPLETED',
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mainAssetId" TEXT,
    "mainQuantity" DECIMAL(24,8),
    "mainPrice" DECIMAL(24,8),
    "baseCurrAmount" DECIMAL(24,8),
    "exchangeRate" DECIMAL(18,6),
    "fee" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "taxWithheld" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "parentTxId" TEXT,
    "rebalanceLogId" TEXT,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "quantity" DECIMAL(24,8) NOT NULL,
    "avgPrice" DECIMAL(24,8) NOT NULL,
    "realizedPL" DECIMAL(24,8) NOT NULL DEFAULT 0,
    "totalDiv" DECIMAL(24,8) NOT NULL DEFAULT 0,
    "targetWeight" DECIMAL(5,2),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RebalanceLog" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalValueBefore" DECIMAL(24,8) NOT NULL,
    "driftBefore" JSONB NOT NULL,
    "description" TEXT,

    CONSTRAINT "RebalanceLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxLot" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "remainingQty" DECIMAL(24,8) NOT NULL,
    "purchasePrice" DECIMAL(24,8) NOT NULL,
    "earnedYear" INTEGER NOT NULL,
    "executedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRecord" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "sourceCountry" TEXT NOT NULL DEFAULT 'US',
    "taxType" "TaxType" NOT NULL,
    "incomeAmount" DECIMAL(18,2) NOT NULL,
    "repeatAmountTHB" DECIMAL(18,2) NOT NULL,
    "fxRate" DECIMAL(18,6) NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "earnedYear" INTEGER NOT NULL,
    "status" "TaxStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "TaxRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioSnapshot" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "equity" DECIMAL(24,8) NOT NULL,
    "cash" DECIMAL(24,8) NOT NULL,
    "unrealizedPL" DECIMAL(24,8) NOT NULL,
    "costBasis" DECIMAL(24,8) NOT NULL,

    CONSTRAINT "PortfolioSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchList" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "WatchList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchListItem" (
    "id" TEXT NOT NULL,
    "watchListId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,

    CONSTRAINT "WatchListItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "targetValue" DECIMAL(18,8) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Portfolio_userId_idx" ON "Portfolio"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CashAccount_portfolioId_currency_isDomestic_key" ON "CashAccount"("portfolioId", "currency", "isDomestic");

-- CreateIndex
CREATE INDEX "LedgerEntry_transactionId_idx" ON "LedgerEntry"("transactionId");

-- CreateIndex
CREATE INDEX "LedgerEntry_cashAccountId_idx" ON "LedgerEntry"("cashAccountId");

-- CreateIndex
CREATE INDEX "LedgerEntry_positionId_idx" ON "LedgerEntry"("positionId");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_symbol_exchange_key" ON "Asset"("symbol", "exchange");

-- CreateIndex
CREATE INDEX "AssetFundamental_assetId_isLatest_idx" ON "AssetFundamental"("assetId", "isLatest");

-- CreateIndex
CREATE UNIQUE INDEX "AssetFundamental_assetId_quarter_year_key" ON "AssetFundamental"("assetId", "quarter", "year");

-- CreateIndex
CREATE INDEX "Transaction_portfolioId_executedAt_idx" ON "Transaction"("portfolioId", "executedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Position_portfolioId_assetId_key" ON "Position"("portfolioId", "assetId");

-- CreateIndex
CREATE UNIQUE INDEX "TaxRecord_transactionId_key" ON "TaxRecord"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioSnapshot_portfolioId_date_key" ON "PortfolioSnapshot"("portfolioId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "WatchListItem_watchListId_assetId_key" ON "WatchListItem"("watchListId", "assetId");

-- CreateIndex
CREATE INDEX "Alert_userId_idx" ON "Alert"("userId");

-- CreateIndex
CREATE INDEX "Alert_assetId_idx" ON "Alert"("assetId");

-- AddForeignKey
ALTER TABLE "Portfolio" ADD CONSTRAINT "Portfolio_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioTag" ADD CONSTRAINT "PortfolioTag_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioTag" ADD CONSTRAINT "PortfolioTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashAccount" ADD CONSTRAINT "CashAccount_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_cashAccountId_fkey" FOREIGN KEY ("cashAccountId") REFERENCES "CashAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetFundamental" ADD CONSTRAINT "AssetFundamental_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DividendAnnouncement" ADD CONSTRAINT "DividendAnnouncement_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_rebalanceLogId_fkey" FOREIGN KEY ("rebalanceLogId") REFERENCES "RebalanceLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_parentTxId_fkey" FOREIGN KEY ("parentTxId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RebalanceLog" ADD CONSTRAINT "RebalanceLog_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxLot" ADD CONSTRAINT "TaxLot_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxLot" ADD CONSTRAINT "TaxLot_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRecord" ADD CONSTRAINT "TaxRecord_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioSnapshot" ADD CONSTRAINT "PortfolioSnapshot_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchList" ADD CONSTRAINT "WatchList_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchListItem" ADD CONSTRAINT "WatchListItem_watchListId_fkey" FOREIGN KEY ("watchListId") REFERENCES "WatchList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchListItem" ADD CONSTRAINT "WatchListItem_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
