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
import { findOrFetchAssetBySymbol } from '../asset/asset.service';
import { createTransaction } from './transaction.service';
import {
  SLIP_DATE_TOLERANCE_MS,
  baseSymbol,
  matchSlipToTransaction,
  parseSlipDate,
  slipDifferences,
  slipHasTime,
} from './slip-matcher';
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
  /**
   * When nothing matches, record the BUY/SELL from the slip itself — in `portfolioId`,
   * or the user's only portfolio. Anything missing comes back as `needs_input`.
   */
  createMissing?: boolean;
}

export interface SlipUpload {
  imageBase64: string;
  mimeType?: string;
}

/** What a new BUY/SELL from a slip needs. Pre-filled from the slip; the user fills the gaps. */
export interface SlipTradeDraft {
  type: 'BUY' | 'SELL' | null;
  symbol: string | null;
  quantity: number | null;
  price: number | null;
  /** In the asset's trading currency. */
  fee: number | null;
}

type SavedSlip = Awaited<ReturnType<typeof saveSlip>>;

/** One per uploaded file, in upload order. Only `matched` and `created` saved anything. */
export type SlipBatchItemResult =
  /** `differences`: where the slip disagrees with the transaction — shown, never applied. */
  | { status: 'matched'; extracted: SlipExtraction; slip: SavedSlip; differences: string[] }
  /** No transaction matched, so one was recorded from the slip (createMissing). */
  | { status: 'created'; extracted: SlipExtraction; slip: SavedSlip }
  | { status: 'not_found'; extracted: SlipExtraction }
  /** createMissing, but a portfolio or trade fields are missing — ask, then createTransactionFromSlip(). */
  | {
      status: 'needs_input';
      extracted: SlipExtraction;
      need: 'portfolio' | 'fields';
      draft: SlipTradeDraft;
      portfolioId: string | null;
      message: string | null;
    }
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
  const { amount, ref } = readable;

  const duplicateRef = await prisma.slipVerification.findUnique({ where: { transRef: ref } });
  if (duplicateRef) {
    throw AppError.conflict('This slip has already been used for another transaction');
  }

  const expectedAmount = transaction.baseCurrAmount != null ? Number(transaction.baseCurrAmount) : null;
  const isAmountMatched = expectedAmount != null && Math.abs(expectedAmount - amount) < 0.01;

  return saveSlip(userId, transactionId, image, extracted!, isAmountMatched);
}

/**
 * Attaches an already-read slip to the transaction the user picked out of an
 * `ambiguous` result — no second Gemini call.
 */
export async function attachReadSlip(
  userId: string,
  transactionId: string,
  upload: SlipUpload,
  extracted: SlipExtraction,
): Promise<SlipBatchItemResult> {
  assertSlipServicesConfigured();
  const image = validateSlipImage(upload.imageBase64, upload.mimeType);

  const transaction = await prisma.transaction.findUnique({ where: { id: transactionId } });
  if (!transaction) throw AppError.notFound('Transaction not found');
  await assertPortfolioOwnership(userId, transaction.portfolioId);

  const readable = readableFields(extracted);
  if (!readable.ok) return { status: 'unreadable', extracted, message: readable.message };
  const [candidate] = await toCandidates([transaction]);
  return saveMatched(userId, image, extracted, candidate!);
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
    results.push(await matchAndSave(userId, item.image, extracted, options));
  }
  return results;
}

/**
 * The order of checks, most certain first:
 * 1. this slip (by its reference) was already used → duplicate
 * 2. a transaction carries the slip's broker order number → that one
 * 3. reconcile on day/time + symbol + quantity + amount (matchSlipToTransaction)
 * 4. nothing → not_found, or with createMissing record it from the slip
 */
async function matchAndSave(
  userId: string,
  image: ValidatedImage,
  extracted: SlipExtraction,
  options: AutoMatchSlipOptions,
): Promise<SlipBatchItemResult> {
  const { portfolioId } = options;
  const readable = readableFields(extracted);
  if (!readable.ok) return { status: 'unreadable', extracted, message: readable.message };

  const duplicateRef = await prisma.slipVerification.findUnique({ where: { transRef: readable.ref } });
  if (duplicateRef) return { status: 'duplicate', extracted };

  if (extracted.orderRef) {
    const byOrder = await prisma.transaction.findFirst({
      where: {
        externalRef: extracted.orderRef,
        portfolio: { userId, deletedAt: null },
        ...(portfolioId ? { portfolioId } : {}),
      },
      include: { slipVerification: { select: { id: true } } },
    });
    if (byOrder) {
      if (byOrder.slipVerification) return { status: 'duplicate', extracted };
      const [candidate] = await toCandidates([byOrder]);
      return saveMatched(userId, image, extracted, candidate!);
    }
  }

  const candidates = await findMatchCandidates(userId, extracted, readable.ref, portfolioId);
  const match = matchSlipToTransaction(extracted, candidates);

  if (match.status === 'ambiguous') {
    return { status: 'ambiguous', extracted, candidateIds: match.candidates.map((c) => c.id) };
  }
  if (match.status === 'matched') return saveMatched(userId, image, extracted, match.candidate);

  if (!options.createMissing || extracted.transactionType === 'EXCHANGE') return { status: 'not_found', extracted };

  const target = portfolioId ?? (await onlyPortfolioId(userId));
  const draft = draftFromSlip(extracted);
  if (!target) {
    return { status: 'needs_input', extracted, need: 'portfolio', draft, portfolioId: null, message: null };
  }
  // A low-confidence read gets shown for checking rather than recorded as-is.
  if (missingDraftFields(draft).length > 0 || extracted.confidence === 'low') {
    return { status: 'needs_input', extracted, need: 'fields', draft, portfolioId: target, message: null };
  }
  return createFromSlip(userId, target, image, extracted, draft, false);
}

async function saveMatched(
  userId: string,
  image: ValidatedImage,
  extracted: SlipExtraction,
  candidate: SlipMatchCandidate,
): Promise<SlipBatchItemResult> {
  const check = matchSlipToTransaction(extracted, [candidate]);
  const isAmountMatched = check.status === 'matched' && check.isAmountMatched;
  try {
    const slip = await saveSlip(userId, candidate.id, image, extracted, isAmountMatched);
    return { status: 'matched', extracted, slip, differences: slipDifferences(extracted, candidate, isAmountMatched) };
  } catch (err) {
    // Lost a unique-constraint race to a concurrent upload of the same slip.
    if ((err as { code?: string }).code === 'P2002') return { status: 'duplicate', extracted };
    console.error('❌ Failed to save matched slip:', err);
    return { status: 'error', extracted, message: 'Matched, but saving the slip failed — try again' };
  }
}

async function onlyPortfolioId(userId: string): Promise<string | null> {
  const portfolios = await prisma.portfolio.findMany({
    where: { userId, deletedAt: null },
    select: { id: true },
    take: 2,
  });
  return portfolios.length === 1 ? portfolios[0]!.id : null;
}

export function draftFromSlip(extracted: SlipExtraction): SlipTradeDraft {
  const type = extracted.transactionType === 'BUY' || extracted.transactionType === 'SELL' ? extracted.transactionType : null;
  return {
    type,
    symbol: extracted.assetSymbol,
    quantity: extracted.quantity,
    price: extracted.price,
    fee: extracted.fee != null ? extracted.fee + (extracted.vat ?? 0) : null,
  };
}

export function missingDraftFields(draft: SlipTradeDraft): ('type' | 'symbol' | 'quantity' | 'price')[] {
  return (['type', 'symbol', 'quantity', 'price'] as const).filter((field) => draft[field] == null);
}

/**
 * Records the BUY/SELL a slip describes, then attaches the slip to it. `confirmed` is
 * true once the user has checked the fields (Discord form); unconfirmed, a fee printed
 * in another currency than the asset trades in is sent back for checking.
 *
 * A BUY also records the deposit that paid for it, as the app's "Add asset" does by
 * default — the money was spent at the broker, not from cash tracked here.
 */
export async function createTransactionFromSlip(
  userId: string,
  portfolioId: string,
  upload: SlipUpload,
  extracted: SlipExtraction,
  draft: SlipTradeDraft,
  confirmed: boolean,
): Promise<SlipBatchItemResult> {
  assertSlipServicesConfigured();
  await assertPortfolioOwnership(userId, portfolioId);
  const image = validateSlipImage(upload.imageBase64, upload.mimeType);

  const readable = readableFields(extracted);
  if (!readable.ok) return { status: 'unreadable', extracted, message: readable.message };
  if (await prisma.slipVerification.findUnique({ where: { transRef: readable.ref } })) {
    return { status: 'duplicate', extracted };
  }
  return createFromSlip(userId, portfolioId, image, extracted, draft, confirmed);
}

async function createFromSlip(
  userId: string,
  portfolioId: string,
  image: ValidatedImage,
  extracted: SlipExtraction,
  draft: SlipTradeDraft,
  confirmed: boolean,
): Promise<SlipBatchItemResult> {
  const readable = readableFields(extracted);
  if (!readable.ok) return { status: 'unreadable', extracted, message: readable.message };
  const { type, symbol, quantity, price } = draft;
  if (!type || !symbol || quantity == null || price == null) {
    return { status: 'needs_input', extracted, need: 'fields', draft, portfolioId, message: null };
  }

  let asset;
  try {
    asset = await resolveSlipAsset(symbol, extracted.currency, portfolioId);
  } catch {
    return {
      status: 'needs_input',
      extracted,
      need: 'fields',
      draft,
      portfolioId,
      message: `ไม่พบหุ้น "${symbol}" — ใส่ symbol ตาม Yahoo เช่น PTT.BK`,
    };
  }

  const slipCurrency = extracted.currency ?? 'THB';
  if (!confirmed && draft.fee && slipCurrency !== asset.currency) {
    return {
      status: 'needs_input',
      extracted,
      need: 'fields',
      draft,
      portfolioId,
      message: `ค่าธรรมเนียมในสลิปเป็น ${slipCurrency} แต่ ${asset.symbol} ซื้อขายเป็น ${asset.currency} — ตรวจอีกครั้ง`,
    };
  }

  const slipDate = parseSlipDate(extracted.transactionDate);
  let transaction;
  try {
    transaction = await createTransaction(userId, {
      portfolioId,
      type,
      assetId: asset.id,
      quantity,
      price,
      fee: draft.fee ?? undefined,
      executedAt: slipDate && slipDate.getTime() <= Date.now() ? slipDate : undefined,
      timeKnown: slipHasTime(extracted.transactionDate) || undefined,
      externalRef: extracted.orderRef ?? undefined,
      note: `จากสลิป Ref ${readable.ref}`,
      fundWithDeposit: type === 'BUY' || undefined,
    });
  } catch (err) {
    if (err instanceof AppError) return { status: 'error', extracted, message: err.message };
    throw err;
  }

  const total = Number(transaction.baseCurrAmount);
  const isAmountMatched = slipCurrency === asset.currency && Math.abs(total - readable.amount) < 0.01;
  try {
    const slip = await saveSlip(userId, transaction.id, image, extracted, isAmountMatched);
    return { status: 'created', extracted, slip };
  } catch (err) {
    console.error('❌ Failed to save slip for a transaction created from it:', err);
    return {
      status: 'error',
      extracted,
      message: 'บันทึกรายการแล้ว แต่แนบรูปสลิปไม่สำเร็จ — แนบเองในแอป',
    };
  }
}

/**
 * Slips print bare tickers ("PTT"), the DB holds Yahoo symbols ("PTT.BK"). Prefer what
 * the portfolio already holds, then any known listing, then ask Yahoo — trying the
 * Thai listing for a THB slip.
 */
async function resolveSlipAsset(symbol: string, slipCurrency: string | null, portfolioId: string) {
  const base = baseSymbol(symbol);
  const typed = symbol.trim().toUpperCase();
  const known = await prisma.asset.findMany({
    where: { OR: [{ symbol: typed }, { symbol: base }, { symbol: { startsWith: `${base}.` } }] },
    include: { positions: { where: { portfolioId }, select: { id: true } } },
  });
  const pick =
    known.find((a) => a.positions.length > 0) ??
    known.find((a) => a.symbol === typed) ??
    known.find((a) => a.currency === slipCurrency) ??
    known[0];
  if (pick) return pick;

  try {
    return await findOrFetchAssetBySymbol(typed);
  } catch (err) {
    if ((slipCurrency ?? 'THB') === 'THB' && !typed.includes('.')) return findOrFetchAssetBySymbol(`${typed}.BK`);
    throw err;
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

/**
 * `ref` identifies the slip itself (stored as SlipVerification.transRef, unique): the
 * transfer reference, or the order number for a broker confirmation without one.
 */
function readableFields(
  extracted: SlipExtraction,
): { ok: true; amount: number; ref: string } | { ok: false; message: string } {
  if (extracted.amount == null) {
    return { ok: false, message: 'Could not read an amount from this slip image — try a clearer photo' };
  }
  const ref = extracted.transRef ?? extracted.orderRef;
  if (!ref) {
    return { ok: false, message: 'Could not read a reference number from this slip — needed to prevent duplicate slips' };
  }
  return { ok: true, amount: extracted.amount, ref };
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

  // Recorded under another order number — a different trade, however alike.
  const sameOrder = transactions.filter(
    (t) => !extracted.orderRef || !t.externalRef || t.externalRef === extracted.orderRef,
  );
  return toCandidates(sameOrder);
}

type TransactionRow = Awaited<ReturnType<typeof prisma.transaction.findMany>>[number];

async function toCandidates(transactions: TransactionRow[]): Promise<SlipMatchCandidate[]> {
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
      timeKnown: meta.timeKnown === true,
      baseCurrAmount: t.baseCurrAmount != null ? Number(t.baseCurrAmount) : null,
      exchangeRate: t.exchangeRate != null ? Number(t.exchangeRate) : null,
      currency: typeof meta.currency === 'string' ? meta.currency : null,
      sourceAmount: typeof meta.sourceAmount === 'number' ? meta.sourceAmount : null,
      sourceCurrency: typeof meta.sourceCurrency === 'string' ? meta.sourceCurrency : null,
      assetSymbol: t.mainAssetId ? (symbolById.get(t.mainAssetId) ?? null) : null,
      quantity: t.mainQuantity != null ? Number(t.mainQuantity) : null,
      price: t.mainPrice != null ? Number(t.mainPrice) : null,
      fee: t.type === 'BUY' || t.type === 'SELL' ? Number(t.fee) : null,
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
        transRef: readable.ref,
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
