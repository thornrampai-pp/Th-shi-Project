-- AlterTable
ALTER TABLE "Alert" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Asset" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ExchangeRate" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Transaction" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "WatchList" ALTER COLUMN "updatedAt" DROP DEFAULT;
