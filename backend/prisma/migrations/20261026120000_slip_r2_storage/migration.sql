-- Slip images move to Cloudflare R2: the row keeps only the object key + metadata.
-- imageUrl becomes nullable and is kept only for legacy base64 rows until they're
-- moved with `npm run slips:migrate-to-r2`.

-- AlterTable
ALTER TABLE "SlipVerification" ADD COLUMN     "imageKey" TEXT,
ADD COLUMN     "imageMimeType" TEXT,
ADD COLUMN     "imageSize" INTEGER,
ALTER COLUMN "imageUrl" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "SlipVerification_imageKey_key" ON "SlipVerification"("imageKey");
