/**
 * Splits P/L on foreign-currency holdings into the part caused by the asset's price
 * and the part caused by the exchange rate, measured in the home currency (THB).
 * PURE — no I/O; rates are passed in.
 *
 * For lots bought at unit cost cᵢ (asset currency) and rate rᵢ, sold/valued at value V
 * (asset currency, net of fees) and rate R:
 *
 *   cost (asset ccy)   C      = Σ qᵢ·cᵢ
 *   cost (home)        C_home = Σ qᵢ·cᵢ·rᵢ
 *   total P/L (home)          = V·R − C_home
 *   stock P/L (home)          = (V − C)·R          price move, converted at today's rate
 *   FX P/L (home)             = Σ qᵢ·cᵢ·(R − rᵢ)   rate move on the original cost
 *
 * stock + FX = total exactly. For a home-currency asset every rate is 1, so FX = 0.
 */

export interface FxLot {
  quantity: number;
  /** Per-unit cost in the asset's (cash account's) currency, fees included. */
  unitCost: number;
  /** Asset currency → home currency at purchase. */
  fxRate: number;
}

export interface FxPLBreakdown {
  /** Cost of the lots in the asset currency. */
  costBasis: number;
  /** Cost of the lots in home currency, at each lot's purchase rate. */
  costBasisHome: number;
  /** Sale proceeds / market value in home currency, at the current rate. */
  valueHome: number;
  /** P/L in the asset currency (what Position.realizedPL holds). */
  pl: number;
  /** Total P/L in home currency = stockPLHome + fxPLHome. */
  plHome: number;
  stockPLHome: number;
  fxPLHome: number;
}

/**
 * @param lots   lots (or the consumed portions of lots) being sold or valued
 * @param value  net proceeds (SELL) or market value (unrealized), asset currency
 * @param rate   asset currency → home currency at sale / valuation time
 */
export function splitPL(lots: FxLot[], value: number, rate: number): FxPLBreakdown {
  let costBasis = 0;
  let costBasisHome = 0;
  let fxPLHome = 0;

  for (const lot of lots) {
    const cost = lot.quantity * lot.unitCost;
    costBasis += cost;
    costBasisHome += cost * lot.fxRate;
    fxPLHome += cost * (rate - lot.fxRate);
  }

  const valueHome = value * rate;
  const stockPLHome = (value - costBasis) * rate;

  return {
    costBasis,
    costBasisHome,
    valueHome,
    pl: value - costBasis,
    plHome: valueHome - costBasisHome,
    stockPLHome,
    fxPLHome,
  };
}
