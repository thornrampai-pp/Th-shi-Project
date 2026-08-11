-- AlterTable
ALTER TABLE "SlipVerification" ADD COLUMN     "fee" DECIMAL(24,8),
ADD COLUMN     "netAmount" DECIMAL(24,8),
ADD COLUMN     "vat" DECIMAL(24,8);
