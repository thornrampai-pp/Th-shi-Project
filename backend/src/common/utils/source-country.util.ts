import { AppError } from '../errors/AppError';

/**
 * Default "country of income source" for tax records — looked up by exchange first,
 * then by trading currency. Users can override it per transaction / tax record, since
 * e.g. a US-listed ADR of a foreign company or a dual-listed stock can be ambiguous.
 */
export const EXCHANGE_COUNTRY: Record<string, string> = {
  SET: 'TH',
  MAI: 'TH',
  NASDAQ: 'US',
  NYSE: 'US',
  AMEX: 'US',
  NYSEARCA: 'US',
  HKEX: 'HK',
  TSE: 'JP',
  LSE: 'GB',
};

export const CURRENCY_COUNTRY: Record<string, string> = {
  THB: 'TH',
  USD: 'US',
  HKD: 'HK',
  JPY: 'JP',
  GBP: 'GB',
  EUR: 'EU',
  SGD: 'SG',
  CNY: 'CN',
};

export function sourceCountryOf(asset: { exchange: string; currency: string }): string {
  return (
    EXCHANGE_COUNTRY[asset.exchange.toUpperCase()] ??
    CURRENCY_COUNTRY[asset.currency.toUpperCase()] ??
    asset.currency.slice(0, 2).toUpperCase()
  );
}

/** ISO 3166-1 alpha-2 (plus "EU" for euro-area income where the country is unknown). */
export function normalizeCountryCode(code: string): string {
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) {
    throw AppError.badRequest(`sourceCountry must be a 2-letter country code (got "${code}")`);
  }
  return normalized;
}
