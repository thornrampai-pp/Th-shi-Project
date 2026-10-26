-- Move thesis analysis from fixed columns (catalysts, risks, notes) into
-- user-editable sections with per-section history. Existing text is carried
-- over before the columns are dropped.

-- CreateTable
CREATE TABLE "ThesisSection" (
    "id" TEXT NOT NULL,
    "thesisId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThesisSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThesisSectionVersion" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThesisSectionVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ThesisSection_thesisId_position_idx" ON "ThesisSection"("thesisId", "position");

-- CreateIndex
CREATE INDEX "ThesisSectionVersion_sectionId_createdAt_idx" ON "ThesisSectionVersion"("sectionId", "createdAt");

-- AddForeignKey
ALTER TABLE "ThesisSection" ADD CONSTRAINT "ThesisSection_thesisId_fkey" FOREIGN KEY ("thesisId") REFERENCES "InvestmentThesis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThesisSectionVersion" ADD CONSTRAINT "ThesisSectionVersion_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "ThesisSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill default sections (must match DEFAULT_SECTION_TITLES in thesis.service.ts)
INSERT INTO "ThesisSection" ("id", "thesisId", "title", "content", "position", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, t."id", d."title",
       CASE d."position" WHEN 1 THEN COALESCE(t."catalysts", '') WHEN 2 THEN COALESCE(t."risks", '') ELSE '' END,
       d."position", t."createdAt", t."updatedAt"
FROM "InvestmentThesis" t
CROSS JOIN (VALUES
    (0, 'ธุรกิจและรายได้'),
    (1, 'ปัจจัยการเติบโต'),
    (2, 'ความเสี่ยง'),
    (3, 'คู่แข่ง'),
    (4, 'จุดซื้อ/จุดขาย'),
    (5, 'ปันผล')
) AS d("position", "title");

INSERT INTO "ThesisSection" ("id", "thesisId", "title", "content", "position", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'โน้ตเพิ่มเติม', t."notes", 6, t."createdAt", t."updatedAt"
FROM "InvestmentThesis" t
WHERE COALESCE(t."notes", '') <> '';

-- Carried-over text becomes each section's first history entry
INSERT INTO "ThesisSectionVersion" ("id", "sectionId", "content", "createdAt", "savedAt")
SELECT gen_random_uuid()::text, s."id", s."content", s."updatedAt", s."updatedAt"
FROM "ThesisSection" s
WHERE s."content" <> '';

-- AlterTable
ALTER TABLE "InvestmentThesis" DROP COLUMN "catalysts",
DROP COLUMN "notes",
DROP COLUMN "risks";
