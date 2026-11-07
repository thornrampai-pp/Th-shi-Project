import { env } from '../../config/env';
import { recordSecCall } from '../monitoring/usage-metrics';

/**
 * Thai mutual funds through the SEC Open API v2 (api.sec.or.th). Yahoo has no Thai
 * funds, so this is the only source for their profile and daily NAV.
 * One "Fund API" subscription key covers both endpoints used here.
 */

const SEC_API = 'https://api.sec.or.th';
const SEC_TIMEOUT_MS = 20_000;

/** Exchange stored on every fund asset — keeps funds apart from Yahoo symbols. */
export const SEC_FUND_EXCHANGE = 'SEC-TH';

export class SecApiError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
  ) {
    super(message);
    this.name = 'SecApiError';
  }
}

export interface SecFundProfile {
  proj_id: string;
  proj_abbr_name: string;
  proj_name_th: string | null;
  proj_name_en: string | null;
  comp_name_th: string | null;
  comp_name_en: string | null;
  fund_status: string | null;
  cancel_date: string | null;
  /** Unit class, e.g. "K-USA-A(A)"; "main" (or "-") for a single-class fund. */
  fund_class_name: string | null;
}

export interface SecFundNav {
  proj_id: string;
  fund_class_name: string | null;
  /** yyyy-mm-dd */
  nav_date: string;
  /** NAV per unit. */
  last_val: number;
}

interface SecPage<T> {
  message?: string;
  next_cursor?: string | null;
  items?: T[];
}

export function isSecConfigured(): boolean {
  return Boolean(env.SEC_API_KEY);
}

async function secGet<T>(path: string, params: Record<string, string | undefined>): Promise<SecPage<T>> {
  if (!env.SEC_API_KEY) throw new SecApiError('SEC_API_KEY is not configured', null);

  const url = new URL(path, SEC_API);
  for (const [key, value] of Object.entries(params)) if (value) url.searchParams.set(key, value);

  const startedAt = performance.now();
  try {
    const response = await fetch(url, {
      headers: { 'Ocp-Apim-Subscription-Key': env.SEC_API_KEY },
      signal: AbortSignal.timeout(SEC_TIMEOUT_MS),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new SecApiError(`SEC API ${path} responded with ${response.status}: ${body.slice(0, 200)}`, response.status);
    }
    // No match is a 204 with an empty body, not an empty list.
    const text = response.status === 204 ? '' : await response.text();
    const page: SecPage<T> = text ? (JSON.parse(text) as SecPage<T>) : { items: [] };
    recordSecCall(path, true, response.status, performance.now() - startedAt, null);
    return page;
  } catch (err) {
    const status = err instanceof SecApiError ? err.status : null;
    recordSecCall(path, false, status, performance.now() - startedAt, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

/** Fund abbreviations are compared case- and whitespace-insensitively ("k-2510" = "K-2510"). */
export function normalizeFundCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '');
}

/** "main" / "-" / blank mean the fund has just one unit class. */
export function isMainClass(className: string | null | undefined): boolean {
  const c = (className ?? '').trim().toLowerCase();
  return c === '' || c === '-' || c === 'main';
}

/** A fund and, for multi-class funds, the unit class the code refers to. */
export interface FundMatch {
  profile: SecFundProfile;
  /** null = single-class fund (NAV is the `main` series). */
  className: string | null;
}

/** Thrown when a code names a multi-class fund without saying which class. */
export class AmbiguousFundError extends Error {
  constructor(
    public readonly code: string,
    public readonly classes: string[],
  ) {
    super(`${code} has several unit classes — use one of: ${classes.join(', ')}`);
    this.name = 'AmbiguousFundError';
  }
}

/**
 * Picks the fund `code` names from SEC profile rows (one row per unit class).
 * - exact class name ("K-USA-A(A)") → that class
 * - exact fund code ("K-2510") with one class → the fund
 * - exact fund code with several classes → AmbiguousFundError, since each class has
 *   its own NAV and guessing would value the holding wrong
 * The SEC search is a partial match on names, so only exact codes count — "PTT" must
 * not pick a fund that merely has PTT in its name. Active funds win over closed ones.
 */
export function matchFund(code: string, profiles: SecFundProfile[]): FundMatch | null {
  const wanted = normalizeFundCode(code);
  const active = (rows: SecFundProfile[]) => rows.find((p) => !p.cancel_date) ?? rows[0];

  const byClass = profiles.filter((p) => !isMainClass(p.fund_class_name) && normalizeFundCode(p.fund_class_name!) === wanted);
  if (byClass.length > 0) {
    const profile = active(byClass)!;
    return { profile, className: profile.fund_class_name };
  }

  const byCode = profiles.filter((p) => normalizeFundCode(p.proj_abbr_name ?? '') === wanted);
  if (byCode.length === 0) return null;

  // The same code can be reused by a later fund — keep only the chosen project's rows.
  const projId = active(byCode)!.proj_id;
  const rows = byCode.filter((p) => p.proj_id === projId);
  const classes = [...new Set(rows.map((p) => p.fund_class_name).filter((c): c is string => !isMainClass(c)))];
  if (classes.length <= 1) return { profile: rows[0]!, className: classes[0] ?? null };
  throw new AmbiguousFundError(wanted, classes.sort());
}

export async function findFundByCode(code: string): Promise<FundMatch | null> {
  const query = code.trim();
  const byProject = await secGet<SecFundProfile>('/v2/fund/general-info/profiles', { project_info: query, page_size: '100' });
  const match = matchFund(query, byProject.items ?? []);
  if (match) return match;

  // A unit class name ("K-USA-A(A)") isn't found by the project search.
  const byClass = await secGet<SecFundProfile>('/v2/fund/general-info/profiles', { fund_class_name: query, page_size: '100' });
  return matchFund(query, byClass.items ?? []);
}

/** Asset.externalId for a fund: the SEC proj_id, plus `#class` for one class of a multi-class fund. */
export function fundExternalId(projId: string, className: string | null): string {
  return className ? `${projId}#${className}` : projId;
}

export function parseFundExternalId(externalId: string): { projId: string; className: string | null } {
  const at = externalId.indexOf('#');
  return at < 0 ? { projId: externalId, className: null } : { projId: externalId.slice(0, at), className: externalId.slice(at + 1) };
}

/**
 * Daily NAV per unit for [start, end] (yyyy-mm-dd), oldest first. Funds with several
 * unit classes return one row per class; `main` (or the only class) is used.
 */
export async function fetchFundNavs(
  projId: string,
  start: string,
  end: string,
  className: string | null = null,
): Promise<SecFundNav[]> {
  const rows: SecFundNav[] = [];
  let cursor: string | undefined;
  // A year of NAVs is ~250 rows; the cap only guards against a cursor loop.
  for (let page = 0; page < 20; page += 1) {
    const result = await secGet<SecFundNav>('/v2/fund/daily-info/nav', {
      proj_id: projId,
      start_nav_date: start,
      end_nav_date: end,
      fund_class_name: className ?? undefined,
      page_size: '100',
      next_cursor: cursor,
    });
    rows.push(...(result.items ?? []));
    cursor = result.next_cursor ?? undefined;
    if (!cursor || (result.items ?? []).length === 0) break;
  }
  return pickClass(rows, className).sort((a, b) => a.nav_date.localeCompare(b.nav_date));
}

/**
 * One NAV per day for the wanted class (`className`), or for a single-class fund the
 * `main` series. Unpriced rows (last_val 0, e.g. after liquidation) are dropped.
 */
export function pickClass(rows: SecFundNav[], className: string | null = null): SecFundNav[] {
  const classes = new Set(rows.map((r) => r.fund_class_name ?? ''));
  const preferred = className ?? (classes.size <= 1 ? null : classes.has('main') ? 'main' : [...classes].sort()[0]!);
  const byDay = new Map<string, SecFundNav>();
  for (const row of rows) {
    if (!(row.last_val > 0)) continue;
    if (preferred !== null && (row.fund_class_name ?? '') !== preferred) continue;
    byDay.set(row.nav_date, row);
  }
  return [...byDay.values()];
}

export function fundDisplayName(profile: SecFundProfile, className: string | null = null): string {
  const name = profile.proj_name_th || profile.proj_name_en || profile.proj_abbr_name;
  return className ? `${name} (${className})` : name;
}
