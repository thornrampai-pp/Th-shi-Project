-- Broker order / deal number, read from slips or typed in the app. Unique per
-- portfolio so the same order can't be recorded twice; NULLs don't collide.

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "externalRef" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_portfolioId_externalRef_key" ON "Transaction"("portfolioId", "externalRef");
