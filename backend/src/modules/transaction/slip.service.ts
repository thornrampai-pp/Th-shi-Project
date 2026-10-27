import { randomUUID } from 'crypto';
import { prisma } from '../../config/prisma';
import { AppError } from '../../common/errors/AppError';
import { assertPortfolioOwnership } from '../../common/utils/portfolio-ownership.util';
import { GeminiRequestError, extractSlipsData } from '../../common/integrations/gemini.util';
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

export const SLIP_BATCH_MAX_FILES = 5;
/**
 * Decoded bytes across one batch. As base64 (~4/3 larger) that's ~9.3 MB, inside both
 * express's 10 MB JSON body limit and Gemini's 20 MB request cap. The web client
 * downsizes photos before sending, so a real batch is far below this.
 */
export const SLIP_BATCH_MAX_BYTES = 7 * 1024 * 1024;

type ValidatedImage = ReturnType<typeof decodeAndValidateImage>;

export interface SlipExtractionHooks {
  /** Called after each failed Gemini attempt, including the last one. */
  onAttemptFailed?: (attempt: number, maxAttempts: number, error: unknown) => Promise<void> | void;
}

export interface AutoMatchSlipOptions extends SlipExtractionHooks {
  /** Only consider transactions in this portfolio (ownership is checked). */
  portfolioId?: string;
}

export interface SlipUpload {
  imageBase64: string;
  mimeType?: string;
}

/** One per uploaded file, in upload order. Only `matched` saved anything. */
export type SlipBatchItemResult =
  | { status: 'matched'; extracted: SlipExtraction; slip: Awaited<ReturnType<typeof saveSlip>> }
  | { status: 'not_found'; extracted: SlipExtraction }
  | { status: 'ambiguous'; extracted: SlipExtraction; candidateIds: string[] }
  | { status: 'duplicate'; extracted: SlipExtraction }
  /** Read, but without the amount or reference number needed to match safely. */
  | { status: 'unreadable'; extracted: SlipExtraction; message: string }
  /** Rejected before reading: not an allowed image, too large, … */
  | { status: 'invalid'; message: string }
  /** Gemini failed GEMINI_MAX_ATTEMPTS times for the whole batch. */
  | { status: 'extraction_failed'; message: string }
  /** Read and matched, but saving failed (storage/DB). */
  | { status: 'error'; extracted: SlipExtraction; message: string };

/**
 * Attaches a slip to a known transaction (the `uploadTransactionSlip` mutation). Goes
 * through the same validation, extraction and save path as autoMatchSlips(), so the
 * logic can't drift between them.
 *
 * The image goes to Cloudflare R2; the DB keeps only its key, MIME type and size.
 */
export async function uploadTransactionSlip(
  userId: string,
  transactionId: string,
  imageBase64: string,
  mimeType?: string,
) {
  assertSlipServicesConfigured();
  const image = validateSlipImage(imageBase64, mimeType);

  const transaction = await prisma.transaction.findUnique({ where: { id: transactionId } });
  if (!transaction) throw AppError.notFound('Transaction not found');
  await assertPortfolioOwnership(userId, transaction.portfolioId);

  const existing = await prisma.slipVerification.findUnique({ where: { transactionId } });
  if (existing) {
    throw AppError.conflict('This transaction already has a slip attached');
  }

  const [extracted] = await extractSlipsWithRetry([image]);
  const readable = readableFields(extracted!);
  if (!readable.ok) throw AppError.badRequest(readable.message);
  const { amount, transRef } = readable;

  const duplicateRef = await prisma.slipVerification.findUnique({ where: { transRef } });
  if (duplicateRef) {
    throw AppError.conflict('This slip has already been used for another transaction');
  }

  const expectedAmount = transaction.baseCurrAmount != null ? Number(transaction.baseCurrAmount) : null;
  const isAmountMatched = expectedAmount != null && Math.abs(expectedAmount - amount) < 0.01;

  return saveSlip(userId, transactionId, image, extracted!, isAmountMatched);
}

/**
 * Reads up to SLIP_BATCH_MAX_FILES slips in ONE Gemini request, then attaches each to
 * whichever of the user's slip-less transactions it matches (amount + transRef + date —
 * see matchSlipToTransaction). Nothing is saved for a slip unless exactly one
 * transaction matches it.
 *
 * Every file gets its own result, so one bad image doesn't sink the rest. Slips are
 * matched one after another in upload order — never concurrently — so two slips in a
 * batch can't both claim the same transaction, and a repeated slip comes back
 * `duplicate`. Throws only for problems with the whole request (config, ownership,
 * too many files / bytes).
 */
export async function autoMatchSlips(
  userId: string,
  uploads: SlipUpload[],
  options: AutoMatchSlipOptions = {},
): Promise<SlipBatchItemResult[]> {
  assertSlipServicesConfigured();
  if (uploads.length === 0) throw AppError.badRequest('Attach at least one slip image');
  if (uploads.length > SLIP_BATCH_MAX_FILES) {
    throw AppError.badRequest(`Up to ${SLIP_BATCH_MAX_FILES} slips per upload`);
  }
  if (options.portfolioId) await assertPortfolioOwnership(userId, options.portfolioId);

  const checked = uploads.map((u): { image: ValidatedImage } | { invalid: string } => {
    try {
      return { image: validateSlipImage(u.imageBase64, u.mimeType) };
    } catch (err) {
      if (err instanceof AppError) return { invalid: err.message };
      throw err;
    }
  });
  const images = checked.flatMap((c) => ('image' in c ? [c.image] : []));

  const totalBytes = images.reduce((sum, image) => sum + image.size, 0);
  if (totalBytes > SLIP_BATCH_MAX_BYTES) {
    throw AppError.badRequest(
      `These slips total ${(totalBytes / 1024 / 1024).toFixed(1)} MB — max ${SLIP_BATCH_MAX_BYTES / 1024 / 1024} MB per upload. Send fewer at a time.`,
    );
  }

  let extractions: SlipExtraction[] | null = null;
  let extractionError = '';
  if (images.length > 0) {
    try {
      extractions = await extractSlipsWithRetry(images, options);
    } catch (err) {
      extractionError = err instanceof Error ? err.message : 'unknown error';
    }
  }

  const results: SlipBatchItemResult[] = [];
  let next = 0;
  for (const item of checked) {
    if ('invalid' in item) {
      results.push({ status: 'invalid', message: item.invalid });
      continue;
    }
    const extracted = extractions?.[next++];
    if (!extracted) {
      results.push({ status: 'extraction_failed', message: extractionError });
      continue;
    }
    results.push(await matchAndSave(userId, item.image, extracted, options.portfolioId));
  }
  return results;
}

async function matchAndSave(
  userId: string,
  image: ValidatedImage,
  extracted: SlipExtraction,
  portfolioId: string | undefined,
): Promise<SlipBatchItemResult> {
  const readable = readableFields(extracted);
  if (!readable.ok) return { status: 'unreadable', extracted, message: readable.message };

  const duplicateRef = await prisma.slipVerification.findUnique({ where: { transRef: readable.transRef } });
  if (duplicateRef) return { status: 'duplicate', extracted };

  const candidates = await findMatchCandidates(userId, extracted, readable.transRef, portfolioId);
  const match = matchSlipToTransaction(extracted, candidates);

  if (match.status === 'not_found') return { status: 'not_found', extracted };
  if (match.status === 'ambiguous') {
    return { status: 'ambiguous', extracted, candidateIds: match.candidates.map((c) => c.id) };
  }

  try {
    const slip = await saveSlip(userId, match.candidate.id, image, extracted, match.isAmountMatched);
    return { status: 'matched', extracted, slip };
  } catch (err) {
    // Lost a unique-constraint race to a concurrent upload of the same slip.
    if ((err as { code?: string }).code === 'P2002') return { status: 'duplicate', extracted };
    console.error('❌ Failed to save matched slip:', err);
    return { status: 'error', extracted, message: 'Matched, but saving the slip failed — try again' };
  }
}

function assertSlipServicesConfigured() {
  if (!env.GEMINI_API_KEY) {
    throw AppError.badRequest('Slip OCR is not configured — set GEMINI_API_KEY');
  }
  if (!isR2Configured()) {
    throw AppError.badRequest('Slip storage is not configured — set the R2_* variables');
  }
}

function validateSlipImage(imageBase64: string, mimeType?: string): ValidatedImage {
  // Cheapest check, and the file must never reach Gemini or R2 unchecked.
  try {
    return decodeAndValidateImage(imageBase64, mimeType, env.SLIP_MAX_BYTES);
  } catch (err) {
    if (err instanceof ImageValidationError) throw AppError.badRequest(err.message);
    throw err;
  }
}

/**
 * One request for the whole batch, retried as a whole. Only failures of the Gemini
 * call itself (network, non-2xx, malformed JSON, wrong result count) are retried. A
 * slip Gemini read but found no amount on is not — at temperature 0 it would just read
 * the same nothing again.
 */
async function extractSlipsWithRetry(
  images: ValidatedImage[],
  hooks: SlipExtractionHooks = {},
): Promise<SlipExtraction[]> {
  const payload = images.map((image) => ({ base64: image.bytes.toString('base64'), mimeType: image.mimeType }));
  let lastError: unknown;

  for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt++) {
    try {
      return await extractSlipsData(payload);
    } catch (err) {
      lastError = err;
      console.warn(`⚠️ Gemini slip extraction attempt ${attempt}/${GEMINI_MAX_ATTEMPTS} failed:`, err);
      // A missing model or bad key won't fix itself — fail now instead of after every retry.
      if (err instanceof GeminiRequestError && !err.retryable) {
        await hooks.onAttemptFailed?.(attempt, attempt, err);
        break;
      }
      await hooks.onAttemptFailed?.(attempt, GEMINI_MAX_ATTEMPTS, err);
      if (attempt < GEMINI_MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, GEMINI_RETRY_BASE_DELAY_MS * attempt));
      }
    }
  }

  throw AppError.badRequest(
    `Could not read the slip(s): ${lastError instanceof Error ? lastError.message : 'unknown error'}`,
  );
}

function readableFields(
  extracted: SlipExtraction,
): { ok: true; amount: number; transRef: string } | { ok: false; message: string } {
  if (extracted.amount == null) {
    return { ok: false, message: 'Could not read an amount from this slip image — try a clearer photo' };
  }
  if (!extracted.transRef) {
    return { ok: false, message: 'Could not read a reference number from this slip — needed to prevent duplicate slips' };
  }
  return { ok: true, amount: extracted.amount, transRef: extracted.transRef };
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
  const readable = readableFields(extracted);
  if (!readable.ok) throw AppError.badRequest(readable.message);

  const imageKey = buildSlipKey(userId, transactionId, image.mimeType);
  await putObject(imageKey, image.bytes, image.mimeType);

  try {
    return await prisma.slipVerification.create({
      data: {
        transactionId,
        imageKey,
        imageMimeType: image.mimeType,
        imageSize: image.size,
        amount: readable.amount,
        transRef: readable.transRef,
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
