import { randomUUID } from 'crypto';
import { prisma } from '../../config/prisma';
import { AppError } from '../../common/errors/AppError';
import { assertPortfolioOwnership } from '../../common/utils/portfolio-ownership.util';
import { extractSlipData } from '../../common/integrations/gemini.util';
import type { SlipExtraction } from '../../common/integrations/gemini.util';
import { deleteObject, getPresignedReadUrl, isR2Configured, putObject } from '../../common/integrations/r2-storage.util';
import {
  IMAGE_EXTENSION,
  ImageValidationError,
  decodeAndValidateImage,
} from '../../common/utils/image-validation.util';
import { env } from '../../config/env';
import { SLIP_DATE_TOLERANCE_MS, matchSlipToTransaction, parseSlipDate } from './slip-matcher';
import type { SlipMatchCandidate } from './slip-matcher';

export const GEMINI_MAX_ATTEMPTS = 5;
const GEMINI_RETRY_BASE_DELAY_MS = 1000;
/** Without a date on the slip, only look this far back for an amount match. */
const UNDATED_SLIP_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000;

type ValidatedImage = ReturnType<typeof decodeAndValidateImage>;

export interface SlipExtractionHooks {
  /** Called after each failed Gemini attempt, including the last one. */
  onAttemptFailed?: (attempt: number, maxAttempts: number, error: unknown) => Promise<void> | void;
}

export interface AutoMatchSlipOptions extends SlipExtractionHooks {
  /** Only consider transactions in this portfolio (ownership is checked). */
  portfolioId?: string;
}

export type AutoMatchSlipResult =
  | { status: 'matched'; extracted: SlipExtraction; slip: Awaited<ReturnType<typeof saveSlip>> }
  | { status: 'not_found'; extracted: SlipExtraction }
  | { status: 'ambiguous'; extracted: SlipExtraction; candidateIds: string[] }
  | { status: 'duplicate'; extracted: SlipExtraction }
  | { status: 'extraction_failed'; error: unknown };

/**
 * Attaches a slip to a known transaction. Shared by the frontend/API
 * `uploadTransactionSlip` mutation; the Discord `/upload-slip` command uses
 * autoMatchSlip() instead, and both go through the same validation, extraction and
 * save path so the logic can't drift between them.
 *
 * The image goes to Cloudflare R2; the DB keeps only its key, MIME type and size.
 */
export async function uploadTransactionSlip(
  userId: string,
  transactionId: string,
  imageBase64: string,
  mimeType?: string,
) {
  const image = validateSlipImage(imageBase64, mimeType);

  const transaction = await prisma.transaction.findUnique({ where: { id: transactionId } });
  if (!transaction) throw AppError.notFound('Transaction not found');
  await assertPortfolioOwnership(userId, transaction.portfolioId);

  const existing = await prisma.slipVerification.findUnique({ where: { transactionId } });
  if (existing) {
    throw AppError.conflict('This transaction already has a slip attached');
  }

  const extracted = await extractSlipWithRetry(image);
  const { amount, transRef } = requireReadableFields(extracted);

  const duplicateRef = await prisma.slipVerification.findUnique({ where: { transRef } });
  if (duplicateRef) {
    throw AppError.conflict('This slip has already been used for another transaction');
  }

  const expectedAmount = transaction.baseCurrAmount != null ? Number(transaction.baseCurrAmount) : null;
  const isAmountMatched = expectedAmount != null && Math.abs(expectedAmount - amount) < 0.01;

  return saveSlip(userId, transactionId, image, extracted, isAmountMatched);
}

/**
 * Reads a slip and attaches it to whichever of the user's slip-less transactions it
 * matches (amount + transRef + date — see matchSlipToTransaction). Nothing is saved
 * unless exactly one transaction matches. A Gemini failure is retried up to
 * GEMINI_MAX_ATTEMPTS times and comes back as `extraction_failed`; bad input
 * (invalid image, unreadable amount/ref, missing config) still throws AppError.
 */
export async function autoMatchSlip(
  userId: string,
  imageBase64: string,
  mimeType?: string,
  options: AutoMatchSlipOptions = {},
): Promise<AutoMatchSlipResult> {
  const image = validateSlipImage(imageBase64, mimeType);
  if (options.portfolioId) await assertPortfolioOwnership(userId, options.portfolioId);

  let extracted: SlipExtraction;
  try {
    extracted = await extractSlipWithRetry(image, options);
  } catch (error) {
    return { status: 'extraction_failed', error };
  }
  const { transRef } = requireReadableFields(extracted);

  const duplicateRef = await prisma.slipVerification.findUnique({ where: { transRef } });
  if (duplicateRef) return { status: 'duplicate', extracted };

  const candidates = await findMatchCandidates(userId, extracted, transRef, options.portfolioId);
  const match = matchSlipToTransaction(extracted, candidates);

  if (match.status === 'not_found') return { status: 'not_found', extracted };
  if (match.status === 'ambiguous') {
    return { status: 'ambiguous', extracted, candidateIds: match.candidates.map((c) => c.id) };
  }

  const slip = await saveSlip(userId, match.candidate.id, image, extracted, match.isAmountMatched);
  return { status: 'matched', extracted, slip };
}

function validateSlipImage(imageBase64: string, mimeType?: string): ValidatedImage {
  if (!env.GEMINI_API_KEY) {
    throw AppError.badRequest('Slip OCR is not configured — set GEMINI_API_KEY');
  }
  if (!isR2Configured()) {
    throw AppError.badRequest('Slip storage is not configured — set the R2_* variables');
  }

  // Cheapest check, and the file must never reach Gemini or R2 unchecked.
  try {
    return decodeAndValidateImage(imageBase64, mimeType, env.SLIP_MAX_BYTES);
  } catch (err) {
    if (err instanceof ImageValidationError) throw AppError.badRequest(err.message);
    throw err;
  }
}

/**
 * Only failures of the Gemini call itself (network, non-2xx, malformed JSON) are
 * retried. An image Gemini read but couldn't find an amount on is not — at
 * temperature 0 it would just read the same nothing again.
 */
async function extractSlipWithRetry(image: ValidatedImage, hooks: SlipExtractionHooks = {}): Promise<SlipExtraction> {
  const base64 = image.bytes.toString('base64');
  let lastError: unknown;

  for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt++) {
    try {
      return await extractSlipData(base64, image.mimeType);
    } catch (err) {
      lastError = err;
      console.warn(`⚠️ Gemini slip extraction attempt ${attempt}/${GEMINI_MAX_ATTEMPTS} failed:`, err);
      await hooks.onAttemptFailed?.(attempt, GEMINI_MAX_ATTEMPTS, err);
      if (attempt < GEMINI_MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, GEMINI_RETRY_BASE_DELAY_MS * attempt));
      }
    }
  }

  throw AppError.badRequest(
    `Could not read this slip after ${GEMINI_MAX_ATTEMPTS} attempts: ${lastError instanceof Error ? lastError.message : 'unknown error'}`,
  );
}

function requireReadableFields(extracted: SlipExtraction): { amount: number; transRef: string } {
  if (extracted.amount == null) {
    throw AppError.badRequest('Could not read an amount from this slip image — try a clearer photo');
  }
  if (!extracted.transRef) {
    throw AppError.badRequest('Could not read a reference number from this slip — needed to prevent duplicate slips');
  }
  return { amount: extracted.amount, transRef: extracted.transRef };
}

async function findMatchCandidates(
  userId: string,
  extracted: SlipExtraction,
  transRef: string,
  portfolioId?: string,
): Promise<SlipMatchCandidate[]> {
  const slipDate = parseSlipDate(extracted.transactionDate);
  const executedAt = slipDate
    ? {
        gte: new Date(slipDate.getTime() - SLIP_DATE_TOLERANCE_MS),
        lte: new Date(slipDate.getTime() + SLIP_DATE_TOLERANCE_MS),
      }
    : { gte: new Date(Date.now() - UNDATED_SLIP_LOOKBACK_MS) };

  const transactions = await prisma.transaction.findMany({
    where: {
      portfolio: { userId, deletedAt: null },
      ...(portfolioId ? { portfolioId } : {}),
      slipVerification: { is: null },
      // A note quoting the slip's ref matches regardless of date.
      OR: [{ executedAt }, { metadata: { path: ['note'], string_contains: transRef } }],
    },
    orderBy: { executedAt: 'desc' },
    take: 200,
  });

  const assetIds = [...new Set(transactions.map((t) => t.mainAssetId).filter((id): id is string => !!id))];
  const assets = assetIds.length
    ? await prisma.asset.findMany({ where: { id: { in: assetIds } }, select: { id: true, symbol: true } })
    : [];
  const symbolById = new Map(assets.map((a) => [a.id, a.symbol]));

  return transactions.map((t) => {
    const meta = (t.metadata && typeof t.metadata === 'object' ? t.metadata : {}) as Record<string, unknown>;
    return {
      id: t.id,
      type: t.type,
      executedAt: t.executedAt,
      baseCurrAmount: t.baseCurrAmount != null ? Number(t.baseCurrAmount) : null,
      exchangeRate: t.exchangeRate != null ? Number(t.exchangeRate) : null,
      currency: typeof meta.currency === 'string' ? meta.currency : null,
      sourceAmount: typeof meta.sourceAmount === 'number' ? meta.sourceAmount : null,
      sourceCurrency: typeof meta.sourceCurrency === 'string' ? meta.sourceCurrency : null,
      assetSymbol: t.mainAssetId ? (symbolById.get(t.mainAssetId) ?? null) : null,
      note: typeof meta.note === 'string' ? meta.note : null,
    };
  });
}

async function saveSlip(
  userId: string,
  transactionId: string,
  image: ValidatedImage,
  extracted: SlipExtraction,
  isAmountMatched: boolean,
) {
  const imageKey = buildSlipKey(userId, transactionId, image.mimeType);
  await putObject(imageKey, image.bytes, image.mimeType);

  try {
    return await prisma.slipVerification.create({
      data: {
        transactionId,
        imageKey,
        imageMimeType: image.mimeType,
        imageSize: image.size,
        ...requireReadableFields(extracted),
        sendingBank: extracted.sendingBank,
        receivingBank: extracted.receivingBank,
        senderName: extracted.senderName,
        currency: extracted.currency ?? 'THB',
        fee: extracted.fee,
        vat: extracted.vat,
        netAmount: extracted.netAmount,
        fxRate: extracted.fxRate,
        targetAmount: extracted.targetAmount,
        targetCurrency: extracted.targetCurrency,
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
