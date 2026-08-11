-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "industry" TEXT,
ADD COLUMN     "isPopular" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sector" TEXT;
