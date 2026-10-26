import { randomUUID } from 'crypto';
import { prisma } from '../../config/prisma';
import { AppError } from '../../common/errors/AppError';
import { assertPortfolioOwnership } from '../../common/utils/portfolio-ownership.util';
import { extractSlipData } from '../../common/integrations/gemini.util';
import { deleteObject, getPresignedReadUrl, isR2Configured, putObject } from '../../common/integrations/r2-storage.util';
import {
  IMAGE_EXTENSION,
  ImageValidationError,
  decodeAndValidateImage,
} from '../../common/utils/image-validation.util';
import { env } from '../../config/env';

/**
 * Shared by BOTH the frontend/API `uploadTransactionSlip` mutation AND the Discord
 * `/upload-slip` command handler — one implementation, two entry points, so the
 * matching/validation logic can never drift between the two.
 *
 * The image goes to Cloudflare R2; the DB keeps only its key, MIME type and size.
 */
export async function uploadTransactionSlip(
  userId: string,
  transactionId: string,
  imageBase64: string,
  mimeType?: string,
) {
  if (!env.GEMINI_API_KEY) {
    throw AppError.badRequest('Slip OCR is not configured — set GEMINI_API_KEY');
  }
  if (!isR2Configured()) {
    throw AppError.badRequest('Slip storage is not configured — set the R2_* variables');
  }

  // Validate the file first — cheapest check, and it must never reach Gemini or R2 unchecked.
  let image: ReturnType<typeof decodeAndValidateImage>;
  try {
    image = decodeAndValidateImage(imageBase64, mimeType, env.SLIP_MAX_BYTES);
  } catch (err) {
    if (err instanceof ImageValidationError) throw AppError.badRequest(err.message);
    throw err;
  }

  const transaction = await prisma.transaction.findUnique({ where: { id: transactionId } });
  if (!transaction) throw AppError.notFound('Transaction not found');
  await assertPortfolioOwnership(userId, transaction.portfolioId);

  const existing = await prisma.slipVerification.findUnique({ where: { transactionId } });
  if (existing) {
    throw AppError.conflict('This transaction already has a slip attached');
  }

  const extracted = await extractSlipData(image.bytes.toString('base64'), image.mimeType);

  if (extracted.amount == null) {
    throw AppError.badRequest('Could not read an amount from this slip image — try a clearer photo');
  }
  if (!extracted.transRef) {
    throw AppError.badRequest('Could not read a reference number from this slip — needed to prevent duplicate slips');
  }

  const duplicateRef = await prisma.slipVerification.findUnique({ where: { transRef: extracted.transRef } });
  if (duplicateRef) {
    throw AppError.conflict('This slip has already been used for another transaction');
  }

  const expectedAmount = transaction.baseCurrAmount != null ? Number(transaction.baseCurrAmount) : null;
  const isAmountMatched = expectedAmount != null && Math.abs(expectedAmount - extracted.amount) < 0.01;

  const imageKey = buildSlipKey(userId, transactionId, image.mimeType);
  await putObject(imageKey, image.bytes, image.mimeType);

  try {
    return await prisma.slipVerification.create({
      data: {
        transactionId,
        imageKey,
        imageMimeType: image.mimeType,
        imageSize: image.size,
        transRef: extracted.transRef,
        sendingBank: extracted.sendingBank,
        receivingBank: extracted.receivingBank,
        senderName: extracted.senderName,
        amount: extracted.amount,
        currency: extracted.currency ?? 'THB',
        fee: extracted.fee,
        rawPayload: extracted as unknown as object,
        isAmountMatched,
      },
    });
  } catch (err) {
    // Don't leave an orphaned object behind if the row couldn't be written
    // (e.g. a concurrent upload won the transRef/transactionId unique race).
    await deleteObject(imageKey).catch((cleanupErr) =>
      console.error(`❌ Failed to clean up orphaned slip ${imageKey}:`, cleanupErr),
    );
    throw err;
  }
}

export function buildSlipKey(userId: string, transactionId: string, mimeType: keyof typeof IMAGE_EXTENSION): string {
  return `slips/${userId}/${transactionId}/${randomUUID()}.${IMAGE_EXTENSION[mimeType]}`;
}

/**
 * Short-lived read URL for a slip image. Legacy rows (pre-R2) still hold a data URI
 * in imageUrl until the migration script has moved them.
 */
export async function getSlipImageUrl(slip: { imageKey: string | null; imageUrl: string | null }): Promise<string | null> {
  if (slip.imageKey) return getPresignedReadUrl(slip.imageKey);
  return slip.imageUrl;
}

export async function getTransactionSlip(userId: string, transactionId: string) {
  const transaction = await prisma.transaction.findUnique({ where: { id: transactionId } });
  if (!transaction) throw AppError.notFound('Transaction not found');
  await assertPortfolioOwnership(userId, transaction.portfolioId);
  return prisma.slipVerification.findUnique({ where: { transactionId } });
}
