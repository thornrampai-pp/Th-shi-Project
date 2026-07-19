-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'ADJUSTMENT';

-- CreateTable
CREATE TABLE "SlipVerification" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "transRef" TEXT NOT NULL,
    "sendingBank" TEXT,
    "receivingBank" TEXT,
    "senderName" TEXT,
    "amount" DECIMAL(24,8) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'THB',
    "fxRate" DECIMAL(18,6),
    "targetAmount" DECIMAL(24,8),
    "targetCurrency" TEXT,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawPayload" JSONB,
    "isAmountMatched" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SlipVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SlipVerification_transactionId_key" ON "SlipVerification"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "SlipVerification_transRef_key" ON "SlipVerification"("transRef");

-- AddForeignKey
ALTER TABLE "SlipVerification" ADD CONSTRAINT "SlipVerification_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
