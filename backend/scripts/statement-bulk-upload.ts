/**
 * Imports a folder of broker statements / confirmation notes (PDF or image) for one
 * user, through the same code the web upload uses (dedupe by order number, cached
 * Gemini reads, Thai fund lookup).
 *
 *   npm run statements:bulk-upload -- --email you@example.com --dir ~/statements
 *     [--map scripts/local/statement-portfolios.json] [--max 5] [--reserve 1] [--dry-run]
 *
 * - Files are processed oldest first by the date in their name (DDMMYYYY, YYYYMMDD,
 *   Buddhist-era years ok) — not by name, which puts 10/07 before 10/03, and a sell
 *   recorded before its buy fails. A file with no date in its name is placed by the
 *   earliest trade date Gemini read from it (if already read), else last.
 * - Every symbol needs a portfolio in the map file ({ "VOO": "Fire", ... }); a file
 *   with an unmapped symbol is skipped untouched and reported — never guessed. Keep
 *   the map in scripts/local/ (git-ignored): it lists what you hold.
 * - Re-running is safe and cheap: files already read reuse their cached read (no
 *   Gemini call), rows already recorded come back as duplicates.
 * - Stops before the Gemini daily budget (GEMINI_RPD_LIMIT minus --reserve, default 1
 *   left for normal app use) is spent — checked before each file AND after every failed
 *   attempt, since one file can retry 5x across every fallback model. Stops the whole
 *   run if every model answers 429. Paces new reads to GEMINI_RPM_LIMIT. Snapshots are
 *   rebuilt once per portfolio at the end.
 * - --dry-run lists the order and what's cached without calling anything.
 */
import 'dotenv/config';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { homedir } from 'os';
import path from 'path';
import { env } from '../src/config/env';
import { prisma } from '../src/config/prisma';
import { redis } from '../src/config/redis';
import { extractionCacheKey, sha256Hex } from '../src/common/utils/extraction-cache.util';
import { dateFromFileName, sortByDateThenName } from '../src/common/utils/filename-date';
import { METRICS_KEYS, geminiQuotaDay } from '../src/common/monitoring/metrics-keys';
import type { StatementExtraction } from '../src/common/integrations/gemini.util';
import { GeminiRequestError } from '../src/common/integrations/gemini.util';
import { confirmStatement, previewStatement } from '../src/modules/transaction/statement-import.service';
import type { StatementRowStatus } from '../src/modules/transaction/statement-import.service';
import { createPortfolio } from '../src/modules/portfolio/portfolio.service';
import { rebuildHistoryNow } from '../src/modules/history/history.service';

const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

interface Args {
  email: string;
  dir: string;
  map: string;
  max: number | null;
  reserve: number;
  dryRun: boolean;
}

/** Thrown from the retry hook to stop the whole run, not just skip one file. */
class QuotaGuard extends Error {}

/** Every model in the chain answered 429 — more files would only burn more calls. */
const isQuotaRefusal = (err: unknown) => err instanceof GeminiRequestError && err.status === 429;

function parseArgs(argv: string[]): Args {
  const value = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const expand = (p: string) => path.resolve(p.replace(/^~(?=$|\/)/, homedir()));
  const email = value('--email');
  const dir = value('--dir');
  if (!email || !dir) {
    console.error('Usage: npm run statements:bulk-upload -- --email <email> --dir <folder> [--map <json>] [--max N] [--dry-run]');
    process.exit(1);
  }
  const max = value('--max');
  const reserve = value('--reserve');
  return {
    email: email.trim().toLowerCase(),
    dir: expand(dir),
    map: expand(value('--map') ?? 'scripts/local/statement-portfolios.json'),
    max: max ? Number(max) : null,
    // Gemini calls left untouched for normal app use (slip uploads etc.).
    reserve: reserve ? Number(reserve) : 1,
    dryRun: argv.includes('--dry-run'),
  };
}

const normalize = (symbol: string) => symbol.trim().toUpperCase();

function loadPortfolioMap(file: string): Map<string, string> {
  if (!existsSync(file)) {
    console.error(`❌ Portfolio map not found: ${file}\n   Create it as { "SYMBOL": "Portfolio name", ... }`);
    process.exit(1);
  }
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  return new Map(
    Object.entries(raw)
      .filter(([key, v]) => !key.startsWith('_') && typeof v === 'string')
      .map(([symbol, name]) => [normalize(symbol), (name as string).trim()]),
  );
}

async function geminiCallsToday(): Promise<number> {
  const used = await redis.hget(METRICS_KEYS.geminiDay(geminiQuotaDay()), 'requests').catch(() => null);
  return Number(used ?? 0);
}

async function cachedRead(bytes: Buffer): Promise<StatementExtraction | null> {
  const raw = await redis.get(extractionCacheKey('statement', sha256Hex(bytes))).catch(() => null);
  return raw ? (JSON.parse(raw) as StatementExtraction) : null;
}

function earliestRowDate(extraction: StatementExtraction | null): Date | null {
  const times = (extraction?.rows ?? [])
    .map((r) => (r.date ? new Date(r.date).getTime() : NaN))
    .filter((t) => Number.isFinite(t));
  return times.length > 0 ? new Date(Math.min(...times)) : null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '—');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const portfolioMap = loadPortfolioMap(args.map);

  const user = await prisma.user.findUnique({ where: { email: args.email }, select: { id: true } });
  if (!user) throw new Error(`No user with email ${args.email}`);

  // Collect, date and sort the files.
  const files = await Promise.all(
    readdirSync(args.dir)
      .filter((name) => MIME_BY_EXT[path.extname(name).toLowerCase()])
      .map(async (name) => {
        const bytes = readFileSync(path.join(args.dir, name));
        const cached = await cachedRead(bytes);
        return {
          name,
          bytes,
          mimeType: MIME_BY_EXT[path.extname(name).toLowerCase()]!,
          cached: cached !== null,
          date: dateFromFileName(name) ?? earliestRowDate(cached),
        };
      }),
  );
  const ordered = sortByDateThenName(files);
  if (ordered.length === 0) throw new Error(`No PDF/image files in ${args.dir}`);

  const rpd = env.GEMINI_RPD_LIMIT ?? Infinity;
  const budgetLimit = rpd - args.reserve;
  const spacingMs = env.GEMINI_RPM_LIMIT ? Math.ceil(60_000 / env.GEMINI_RPM_LIMIT) + 2_000 : 0;
  const usedAtStart = await geminiCallsToday();
  console.log(
    `📂 ${ordered.length} file(s) in ${args.dir} — ${ordered.filter((f) => f.cached).length} already read` +
      ` · Gemini today ${usedAtStart}/${rpd === Infinity ? '∞' : rpd}`,
  );

  if (args.dryRun) {
    for (const f of ordered) console.log(`  ${day(f.date)}  ${f.cached ? 'cached' : 'new   '}  ${f.name}`);
    return;
  }

  // Portfolio name → id, creating missing ones once (case-insensitive).
  const existing = await prisma.portfolio.findMany({ where: { userId: user.id, deletedAt: null }, select: { id: true, name: true } });
  const portfolioIdByName = new Map(existing.map((p) => [p.name.toLowerCase(), p.id]));
  async function portfolioFor(name: string): Promise<string> {
    const known = portfolioIdByName.get(name.toLowerCase());
    if (known) return known;
    const created = await createPortfolio(user!.id, { name, strategy: 'VALUE', baseCurrency: 'THB', type: 'REAL' });
    portfolioIdByName.set(name.toLowerCase(), created.id);
    console.log(`  ➕ created portfolio "${name}"`);
    return created.id;
  }

  const totals: Record<StatementRowStatus, number> = { created: 0, duplicate: 0, unreadable: 0, error: 0 };
  const problems: string[] = [];
  const rebuildFrom = new Map<string, Date>(); // portfolioId → earliest new trade
  let newReads = 0;
  let lastReadAt = 0;
  let stoppedEarly = false;

  for (const [i, file] of ordered.entries()) {
    const label = `[${i + 1}/${ordered.length}] ${day(file.date)} ${file.name}`;

    if (!file.cached) {
      const used = await geminiCallsToday();
      if (used >= budgetLimit) {
        console.log(`⏸️  Gemini daily budget spent (${used}/${rpd}, reserve ${args.reserve}) — stopping before ${file.name}. Run again tomorrow.`);
        stoppedEarly = true;
        break;
      }
      if (args.max !== null && newReads >= args.max) {
        console.log(`⏸️  --max ${args.max} new read(s) reached — stopping before ${file.name}.`);
        break;
      }
      const wait = lastReadAt + spacingMs - Date.now();
      if (wait > 0) await sleep(wait);
    }

    let preview;
    try {
      preview = await previewStatement(
        user.id,
        { imageBase64: file.bytes.toString('base64'), mimeType: file.mimeType },
        {
          onAttemptFailed: async (attempt, max, err) => {
            console.warn(`  ⚠️ attempt ${attempt}/${max}: ${err instanceof Error ? err.message.slice(0, 160) : err}`);
            // One file can retry 5x across 3 models (up to 15 calls), so the
            // between-files check alone can overshoot the day: re-check mid-file.
            const used = await geminiCallsToday();
            if (used >= budgetLimit) throw new QuotaGuard(`Gemini budget reached mid-file (${used}/${rpd}, reserve ${args.reserve})`);
            if (isQuotaRefusal(err)) throw new QuotaGuard('Gemini refused on quota (429) on every model');
          },
        },
      );
    } catch (err) {
      if (err instanceof QuotaGuard) {
        console.log(`${label} ⏸️  ${err.message} — stopping; this file stays queued for the next run.`);
        stoppedEarly = true;
        break;
      }
      problems.push(`${file.name}: ${err instanceof Error ? err.message : err}`);
      console.log(`${label} ❌ ${err instanceof Error ? err.message : err}`);
      continue;
    } finally {
      if (!file.cached) {
        newReads += 1;
        lastReadAt = Date.now();
      }
    }

    const unmapped = preview.groups.map((g) => g.symbol).filter((s) => !portfolioMap.has(normalize(s)));
    if (unmapped.length > 0) {
      problems.push(`${file.name}: not in the map → ${unmapped.join(', ')} (file skipped, nothing recorded)`);
      console.log(`${label} ⏭️  skipped — unmapped symbol(s): ${unmapped.join(', ')}`);
      continue;
    }

    const assignments = [];
    for (const g of preview.groups) {
      assignments.push({ symbol: g.symbol, portfolioId: await portfolioFor(portfolioMap.get(normalize(g.symbol))!) });
    }
    const portfolioIdBySymbol = new Map(assignments.map((a) => [normalize(a.symbol), a.portfolioId]));

    const summary = await confirmStatement(user.id, preview.statementId, assignments);
    const counts: Record<StatementRowStatus, number> = { created: 0, duplicate: 0, unreadable: 0, error: 0 };
    for (const r of summary.rows) {
      counts[r.status] += 1;
      totals[r.status] += 1;
      if (r.status === 'error' || r.status === 'unreadable') {
        problems.push(`${file.name}: ${r.row.symbol ?? '?'} order ${r.row.orderId ?? '—'} — ${r.message ?? r.status}`);
      }
      if (r.status === 'created' && r.row.symbol) {
        const pid = portfolioIdBySymbol.get(normalize(r.row.symbol));
        const at = r.row.date ? new Date(r.row.date) : new Date();
        if (pid && (!rebuildFrom.has(pid) || at < rebuildFrom.get(pid)!)) rebuildFrom.set(pid, at);
      }
    }
    console.log(
      `${label} ${file.cached ? '(cached)' : '(read)'} 🆕 ${counts.created} · ⏭️ ${counts.duplicate} · ❓ ${counts.unreadable} · ❌ ${counts.error}`,
    );
  }

  for (const [portfolioId, from] of rebuildFrom) {
    console.log(`📸 Rebuilding snapshots for ${portfolioId} from ${day(from)}…`);
    await rebuildHistoryNow(portfolioId, from);
  }

  console.log(
    `\n${stoppedEarly ? '⏸️  Stopped early' : '✅ Done'} — 🆕 ${totals.created} · ⏭️ ${totals.duplicate} · ❓ ${totals.unreadable} · ❌ ${totals.error}` +
      ` · new Gemini reads ${newReads} (today ${await geminiCallsToday()}/${rpd === Infinity ? '∞' : rpd})`,
  );
  if (problems.length > 0) {
    console.log(`\n⚠️  Needs attention (${problems.length}):`);
    for (const p of problems) console.log(`  - ${p}`);
  }
}

main()
  .catch((err) => {
    console.error('❌ Failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    redis.disconnect();
    await prisma.$disconnect();
    process.exit();
  });
