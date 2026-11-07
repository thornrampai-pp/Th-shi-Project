// Imports a multi-trade statement / confirmation note (one PDF or image, many rows) in
// one go — unlike slip.service.ts, where one uploaded file is always one transaction.
//
// The document is uploaded to R2 once; every transaction created from it shares that
// same imageKey (SlipVerification.imageKey is intentionally not unique — see the
// migration that dropped its unique index).
import { randomUUID } from 'crypto';
import { sha256Hex, withExtractionCache } from '../../common/utils/extraction-cache.util';
import { prisma } from '../../config/prisma';
import { AppError } from '../../common/errors/AppError';
import { assertPortfolioOwnership } from '../../common/utils/portfolio-ownership.util';
import { GeminiRequestError, extractStatementData } from '../../common/integrations/gemini.util';
import type { StatementExtraction, StatementRow } from '../../common/integrations/gemini.util';
import { putObject } from '../../common/integrations/r2-storage.util';
import { IMAGE_EXTENSION, ImageValidationError, decodeAndValidateImage } from '../../common/utils/image-validation.util';
import { env } from '../../config/env';
import { createTransaction } from './transaction.service';
import {
  GEMINI_MAX_ATTEMPTS,
  GEMINI_RETRY_BASE_DELAY_MS,
  assertSlipServicesConfigured,
  resolveSlipAsset,
} from './slip.service';
import type { SlipExtractionHooks } from './slip.service';
import { baseSymbol, parseSlipDate } from './slip-matcher';
import { createPortfolio } from '../portfolio/portfolio.service';
import { redis } from '../../config/redis';

export interface StatementUpload {
  imageBase64: string;
  mimeType?: string;
}

export type StatementRowStatus = 'created' | 'duplicate' | 'unreadable' | 'error';

export interface StatementRowResult {
  row: StatementRow;
  status: StatementRowStatus;
  transactionId: string | null;
  message: string | null;
}

export interface StatementImportSummary {
  broker: string | null;
  rows: StatementRowResult[];
}

type ValidatedDocument = ReturnType<typeof decodeAndValidateImage>;

const PENDING_TTL_SECONDS = 60 * 60;
// Same as the Gemini read cache — a retry within this window reuses both.
const STORED_FILE_TTL_SECONDS = 30 * 24 * 3600;
const pendingKey = (id: string) => `statement-import:${id}`;

/** What the preview step parks in Redis until the user says where each asset goes. */
interface PendingStatement {
  userId: string;
  imageKey: string;
  file: StatementFile;
  broker: string | null;
  rows: StatementRow[];
}

interface StatementFile {
  mimeType: string;
  size: number;
}

/** One distinct asset in the file, and where it could go. */
export interface StatementGroup {
  symbol: string;
  rowCount: number;
  /** The user's portfolios that already hold this asset, largest holding first. */
  heldInPortfolioIds: string[];
  /** The single portfolio to use without asking — set only when exactly one holds it. */
  suggestedPortfolioId: string | null;
}

export interface StatementPreview {
  statementId: string;
  broker: string | null;
  groups: StatementGroup[];
  /** Rows that can't be imported whatever the portfolio (no order id / incomplete). */
  unreadableCount: number;
}

/** Where one asset's rows go: an existing portfolio, or a new one created on confirm. */
export interface StatementAssignment {
  symbol: string;
  portfolioId?: string;
  newPortfolioName?: string;
}

function isImportable(row: StatementRow): boolean {
  return !!row.orderId && !!row.transactionType && !!row.symbol && row.quantity != null && row.price != null;
}

/**
 * Step 1: reads the document, stores it once in R2 and groups its rows by asset with
 * the portfolio each already lives in. Nothing is recorded yet.
 */
export async function previewStatement(
  userId: string,
  upload: StatementUpload,
  hooks: SlipExtractionHooks = {},
): Promise<StatementPreview> {
  assertSlipServicesConfigured();

  const document = validateStatementDocument(upload.imageBase64, upload.mimeType);
  const extraction = await extractStatementWithRetry(document, hooks);
  if (extraction.rows.length === 0) {
    throw AppError.badRequest('Could not find any trade rows in this document');
  }

  const imageKey = await storeStatementOnce(userId, document);

  const statementId = randomUUID();
  const pending: PendingStatement = {
    userId,
    imageKey,
    file: { mimeType: document.mimeType, size: document.size },
    broker: extraction.broker,
    rows: extraction.rows,
  };
  await redis.set(pendingKey(statementId), JSON.stringify(pending), 'EX', PENDING_TTL_SECONDS);

  const counts = new Map<string, number>();
  for (const row of extraction.rows) {
    if (isImportable(row)) counts.set(row.symbol!, (counts.get(row.symbol!) ?? 0) + 1);
  }
  const groups: StatementGroup[] = [];
  for (const [symbol, rowCount] of counts) {
    const held = await portfoliosHolding(userId, symbol);
    groups.push({
      symbol,
      rowCount,
      heldInPortfolioIds: held,
      suggestedPortfolioId: held.length === 1 ? held[0]! : null,
    });
  }

  return {
    statementId,
    broker: extraction.broker,
    groups,
    unreadableCount: extraction.rows.filter((r) => !isImportable(r)).length,
  };
}

/**
 * Step 2: records every row in the portfolio chosen for its asset. Re-importing the
 * same statement is safe — a row whose orderId was already recorded comes back as
 * 'duplicate' and is skipped.
 */
export async function confirmStatement(
  userId: string,
  statementId: string,
  assignments: StatementAssignment[],
): Promise<StatementImportSummary> {
  const raw = await redis.get(pendingKey(statementId));
  const pending = raw ? (JSON.parse(raw) as PendingStatement) : null;
  if (!pending || pending.userId !== userId) {
    throw AppError.notFound('This statement has expired — upload it again');
  }

  // Resolve each symbol to a portfolio first (creating the new ones), so a bad
  // assignment fails before anything is recorded.
  const portfolioBySymbol = new Map<string, string>();
  // Several assets sent to the same new portfolio name share one new portfolio.
  const createdByName = new Map<string, string>();
  for (const a of assignments) {
    const symbol = a.symbol.trim().toUpperCase();
    if (a.portfolioId) {
      await assertPortfolioOwnership(userId, a.portfolioId);
      portfolioBySymbol.set(symbol, a.portfolioId);
    } else if (a.newPortfolioName?.trim()) {
      const name = a.newPortfolioName.trim();
      const portfolioId =
        createdByName.get(name.toLowerCase()) ??
        (await createPortfolio(userId, { name, strategy: 'VALUE', baseCurrency: 'THB', type: 'REAL' })).id;
      createdByName.set(name.toLowerCase(), portfolioId);
      portfolioBySymbol.set(symbol, portfolioId);
    }
  }

  const rows: StatementRowResult[] = [];
  for (const row of pending.rows) {
    const portfolioId = row.symbol ? portfolioBySymbol.get(row.symbol) : undefined;
    if (!isImportable(row) || !portfolioId) {
      const message = isImportable(row)
        ? `ไม่ได้เลือกพอร์ตสำหรับ ${row.symbol}`
        : 'ข้อมูลรายการไม่ครบ (เลขที่คำสั่ง/ประเภท/ชื่อหุ้น/จำนวน/ราคา)';
      rows.push({ row, status: 'unreadable', transactionId: null, message });
      continue;
    }
    rows.push(await importRow(userId, portfolioId, row, pending.imageKey, pending.file));
  }

  await redis.del(pendingKey(statementId));
  return { broker: pending.broker, rows };
}

/** The user's portfolios holding `symbol` (as typed, or its Thai/US listing), largest first. */
async function portfoliosHolding(userId: string, symbol: string): Promise<string[]> {
  const base = baseSymbol(symbol);
  const positions = await prisma.position.findMany({
    where: {
      quantity: { gt: 0 },
      portfolio: { userId, deletedAt: null },
      asset: { OR: [{ symbol }, { symbol: base }, { symbol: { startsWith: `${base}.` } }] },
    },
    orderBy: { quantity: 'desc' },
    select: { portfolioId: true },
  });
  return [...new Set(positions.map((p) => p.portfolioId))];
}

async function importRow(
  userId: string,
  portfolioId: string,
  row: StatementRow,
  imageKey: string,
  file: StatementFile,
): Promise<StatementRowResult> {
  if (!row.orderId) {
    return { row, status: 'unreadable', transactionId: null, message: 'ไม่พบเลขที่คำสั่งของรายการนี้ — ข้ามไป' };
  }
  if (!row.transactionType || !row.symbol || row.quantity == null || row.price == null) {
    return { row, status: 'unreadable', transactionId: null, message: 'ข้อมูลรายการไม่ครบ (ประเภท/ชื่อหุ้น/จำนวน/ราคา)' };
  }

  let asset;
  try {
    asset = await resolveSlipAsset(row.symbol, row.currency, portfolioId);
  } catch {
    return { row, status: 'unreadable', transactionId: null, message: `ไม่พบหุ้น "${row.symbol}"` };
  }

  const executedAtRaw = parseSlipDate(row.date);
  const executedAt = executedAtRaw && executedAtRaw.getTime() <= Date.now() ? executedAtRaw : undefined;

  let transaction;
  try {
    transaction = await createTransaction(userId, {
      portfolioId,
      type: row.transactionType,
      assetId: asset.id,
      quantity: row.quantity,
      price: row.price,
      fee: row.fee ?? undefined,
      currency: row.currency ?? undefined,
      executedAt,
      externalRef: row.orderId,
      note: `จาก statement เลขที่คำสั่ง ${row.orderId}`,
      fundWithDeposit: row.transactionType === 'BUY' || undefined,
    });
  } catch (err) {
    if (err instanceof AppError && err.code === 'CONFLICT') {
      return { row, status: 'duplicate', transactionId: null, message: err.message };
    }
    if (err instanceof AppError) return { row, status: 'error', transactionId: null, message: err.message };
    throw err;
  }

  // Attaching the shared document is best-effort — the transaction is already
  // correctly recorded even if this fails.
  try {
    await prisma.slipVerification.create({
      data: {
        transactionId: transaction.id,
        imageKey,
        imageMimeType: file.mimeType,
        imageSize: file.size,
        transRef: row.orderId,
        amount: row.totalAmount ?? row.quantity * row.price,
        currency: row.currency ?? 'THB',
        fee: row.fee,
        isAmountMatched: true,
        rawPayload: row as unknown as object,
      },
    });
  } catch (err) {
    console.error('❌ Failed to attach statement document to transaction:', err);
  }

  return { row, status: 'created', transactionId: transaction.id, message: null };
}

function validateStatementDocument(imageBase64: string, mimeType?: string): ValidatedDocument {
  try {
    return decodeAndValidateImage(imageBase64, mimeType, env.SLIP_MAX_BYTES);
  } catch (err) {
    if (err instanceof ImageValidationError) throw AppError.badRequest(err.message);
    throw err;
  }
}

function extractStatementWithRetry(document: ValidatedDocument, hooks: SlipExtractionHooks): Promise<StatementExtraction> {
  // The same file uploaded again (e.g. to retry rows that failed) reuses the earlier
  // read; rows already recorded are skipped by order number at confirm time. A read
  // that found no rows isn't kept, so a later attempt can still do better.
  return withExtractionCache(
    'statement',
    [document.bytes],
    () => readStatementWithRetry(document, hooks),
    (extraction) => extraction.rows.length > 0,
  );
}

async function readStatementWithRetry(
  document: ValidatedDocument,
  hooks: SlipExtractionHooks,
): Promise<StatementExtraction> {
  const payload = { base64: document.bytes.toString('base64'), mimeType: document.mimeType };
  let lastError: unknown;

  for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt++) {
    try {
      return await extractStatementData(payload);
    } catch (err) {
      lastError = err;
      console.warn(`⚠️ Gemini statement extraction attempt ${attempt}/${GEMINI_MAX_ATTEMPTS} failed:`, err);
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
    `Could not read this statement: ${lastError instanceof Error ? lastError.message : 'unknown error'}`,
  );
}

/**
 * Uploads the document to R2 — once per user and file: the same file uploaded again
 * (a retry) reuses the stored copy instead of leaving another orphan object behind.
 */
async function storeStatementOnce(userId: string, document: ValidatedDocument): Promise<string> {
  const fileKey = `statement-file:${userId}:${sha256Hex(document.bytes)}`;
  const known = await redis.get(fileKey).catch(() => null);
  if (known) return known;

  const imageKey = buildStatementKey(userId, document.mimeType);
  await putObject(imageKey, document.bytes, document.mimeType);
  await redis.set(fileKey, imageKey, 'EX', STORED_FILE_TTL_SECONDS).catch(() => {});
  return imageKey;
}

function buildStatementKey(userId: string, mimeType: keyof typeof IMAGE_EXTENSION): string {
  return `statements/${userId}/${randomUUID()}.${IMAGE_EXTENSION[mimeType]}`;
}
