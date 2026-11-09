/**
 * Fractional-share brokers (Dime) print quantities rounded to 7 decimals, so a full
 * exit can come out a hair below the recorded holding — e.g. after a split multiplies
 * a rounded buy: 0.0134256 x 10 = 0.134256 held vs 0.1342556 sold. The broker shows 0;
 * without this the app keeps 0.0000004 shares open forever.
 *
 * Shared by the live SELL (transaction.service) and the snapshot replay so both agree.
 */
export const POSITION_DUST_QTY = 1e-6;

/**
 * How much a sell takes out of the position: all of it when what it would leave behind
 * is a positive leftover under POSITION_DUST_QTY, otherwise exactly what was sold.
 * Selling MORE than is held is not stretched here — that stays an error for the caller.
 */
export function quantityRemovedBySell(held: number, sold: number): number {
  const left = held - sold;
  return left > 0 && left < POSITION_DUST_QTY ? held : sold;
}
