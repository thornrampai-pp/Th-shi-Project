-- CreateTable
CREATE TABLE "AssetPrice" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "closePrice" DECIMAL(12,4) NOT NULL,
    "openPrice" DECIMAL(12,4),
    "highPrice" DECIMAL(12,4),
    "lowPrice" DECIMAL(12,4),
    "volume" BIGINT,

    CONSTRAINT "AssetPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssetPrice_assetId_date_idx" ON "AssetPrice"("assetId", "date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "AssetPrice_assetId_date_key" ON "AssetPrice"("assetId", "date");

-- AddForeignKey
ALTER TABLE "AssetPrice" ADD CONSTRAINT "AssetPrice_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
