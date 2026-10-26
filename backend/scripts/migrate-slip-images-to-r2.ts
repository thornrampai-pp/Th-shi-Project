/**
 * One-off: moves legacy slip images (base64 data URIs in SlipVerification.imageUrl)
 * into Cloudflare R2 and replaces them with imageKey/imageMimeType/imageSize.
 * Safe to re-run — only rows that still have imageUrl and no imageKey are touched.
 *
 *   npm run slips:migrate-to-r2            # migrate
 *   npm run slips:migrate-to-r2 -- --dry   # report only
 */
import { prisma } from '../src/config/prisma';
import { redis } from '../src/config/redis';
import { isR2Configured, putObject } from '../src/common/integrations/r2-storage.util';
import { decodeAndValidateImage } from '../src/common/utils/image-validation.util';
import { buildSlipKey } from '../src/modules/transaction/slip.service';

// Legacy rows were never size-checked, so don't reject them for size here.
const NO_SIZE_LIMIT = Number.MAX_SAFE_INTEGER;

async function main() {
  const dryRun = process.argv.includes('--dry');
  if (!dryRun && !isR2Configured()) throw new Error('Set the R2_* variables first');

  const legacy = await prisma.slipVerification.findMany({
    where: { imageKey: null, imageUrl: { not: null } },
    include: { transaction: { include: { portfolio: true } } },
  });
  console.log(`Found ${legacy.length} legacy slip image(s)${dryRun ? ' (dry run)' : ''}`);

  let migrated = 0;
  for (const slip of legacy) {
    try {
      const declared = /^data:([^;,]+);base64,/.exec(slip.imageUrl!)?.[1];
      const image = decodeAndValidateImage(slip.imageUrl!, declared, NO_SIZE_LIMIT);
      if (dryRun) {
        console.log(`  ${slip.id}: ${image.mimeType}, ${image.size} bytes`);
        continue;
      }

      const key = buildSlipKey(slip.transaction.portfolio.userId, slip.transactionId, image.mimeType);
      await putObject(key, image.bytes, image.mimeType);
      await prisma.slipVerification.update({
        where: { id: slip.id },
        data: { imageKey: key, imageMimeType: image.mimeType, imageSize: image.size, imageUrl: null },
      });
      migrated += 1;
    } catch (err) {
      console.error(`  ❌ ${slip.id}: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (!dryRun) console.log(`✅ Migrated ${migrated}/${legacy.length}`);
}

main()
  .catch((err) => {
    console.error('❌ Migration failed:', err);
    process.exitCode = 1;
  })
  .finally(() => Promise.all([prisma.$disconnect(), redis.quit()]));
