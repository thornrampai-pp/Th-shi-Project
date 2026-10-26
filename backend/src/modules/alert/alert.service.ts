import { prisma } from "../../config/prisma";
import { AppError } from "../../common/errors/AppError";
import { getAssetQuote, getLatestPrice } from "../asset/asset.service";
import { yahooSymbolOf } from "../../common/integrations/yahoo-finance.util";
import { buildInvestmentEmbed } from "../../common/integrations/discord.util";
import { notifyEvent } from "../notification/notification.service";

/** Stored as a plain string in Alert.condition — this list is the source of truth. */
export const ALERT_CONDITIONS = [
  "PRICE_ABOVE",
  "PRICE_BELOW",
  "CHANGE_PCT_ABOVE",
  "CHANGE_PCT_BELOW",
  "PE_ABOVE",
  "PE_BELOW",
  "DIVIDEND_YIELD_ABOVE",
] as const;

export type AlertConditionValue = (typeof ALERT_CONDITIONS)[number];

const CONDITION_LABEL: Record<AlertConditionValue, string> = {
  PRICE_ABOVE: "ราคาสูงกว่า",
  PRICE_BELOW: "ราคาต่ำกว่า",
  CHANGE_PCT_ABOVE: "% เปลี่ยนแปลงวันนี้สูงกว่า",
  CHANGE_PCT_BELOW: "% เปลี่ยนแปลงวันนี้ต่ำกว่า",
  PE_ABOVE: "P/E สูงกว่า",
  PE_BELOW: "P/E ต่ำกว่า",
  DIVIDEND_YIELD_ABOVE: "Dividend Yield (%) สูงกว่า",
};

function assertCondition(condition: string): asserts condition is AlertConditionValue {
  if (!(ALERT_CONDITIONS as readonly string[]).includes(condition)) {
    throw AppError.badRequest(`Unknown alert condition: ${condition}`);
  }
}

async function getOwnedAlertOrThrow(userId: string, id: string) {
  const alert = await prisma.alert.findUnique({ where: { id } });
  if (!alert || alert.userId !== userId) {
    throw AppError.notFound("Alert not found");
  }
  return alert;
}

export async function listAlerts(userId: string, filters: { assetId?: string; isActive?: boolean }) {
  return prisma.alert.findMany({
    where: { userId, ...filters },
    include: { asset: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function createAlert(
  userId: string,
  input: { assetId: string; condition: string; targetValue: number },
) {
  assertCondition(input.condition);
  if (!Number.isFinite(input.targetValue)) throw AppError.badRequest("targetValue must be a number");

  const asset = await prisma.asset.findUnique({ where: { id: input.assetId } });
  if (!asset) throw AppError.notFound("Asset not found");

  return prisma.alert.create({
    data: { userId, assetId: input.assetId, condition: input.condition, targetValue: input.targetValue },
    include: { asset: true },
  });
}

export async function updateAlert(
  userId: string,
  id: string,
  input: { condition?: string; targetValue?: number; isActive?: boolean },
) {
  await getOwnedAlertOrThrow(userId, id);
  if (input.condition != null) assertCondition(input.condition);

  return prisma.alert.update({ where: { id }, data: input, include: { asset: true } });
}

export async function deleteAlert(userId: string, id: string): Promise<boolean> {
  await getOwnedAlertOrThrow(userId, id);
  await prisma.alert.delete({ where: { id } });
  return true;
}

interface MarketSnapshot {
  price: number | null;
  changePercent: number | null;
  peRatio: number | null;
  dividendYield: number | null;
}

async function loadMarketSnapshot(asset: { id: string; symbol: string; exchange: string }): Promise<MarketSnapshot> {
  const [price, quote, fundamental] = await Promise.all([
    getLatestPrice(asset),
    getAssetQuote(yahooSymbolOf(asset)).catch(() => null),
    prisma.assetFundamental.findFirst({ where: { assetId: asset.id, isLatest: true } }),
  ]);

  return {
    price,
    changePercent: quote?.changePercent ?? null,
    peRatio: fundamental?.peRatio != null ? Number(fundamental.peRatio) : null,
    dividendYield: fundamental?.dividendYield != null ? Number(fundamental.dividendYield) : null,
  };
}

/** Returns the observed value when the condition is met, null otherwise (incl. missing data). */
export function evaluateCondition(
  condition: AlertConditionValue,
  target: number,
  market: MarketSnapshot,
): number | null {
  const check = (value: number | null, hit: (v: number) => boolean) =>
    value != null && hit(value) ? value : null;

  switch (condition) {
    case "PRICE_ABOVE":
      return check(market.price, (v) => v >= target);
    case "PRICE_BELOW":
      return check(market.price, (v) => v <= target);
    case "CHANGE_PCT_ABOVE":
      return check(market.changePercent, (v) => v >= target);
    case "CHANGE_PCT_BELOW":
      return check(market.changePercent, (v) => v <= target);
    case "PE_ABOVE":
      return check(market.peRatio, (v) => v >= target);
    case "PE_BELOW":
      return check(market.peRatio, (v) => v <= target);
    case "DIVIDEND_YIELD_ABOVE":
      return check(market.dividendYield, (v) => v >= target);
  }
}

/**
 * Called by the alert cron job. Evaluates every active alert (grouped per asset, so
 * each asset costs one quote lookup), sends ALERT_TRIGGERED, and deactivates the
 * alert — alerts are one-shot; the user re-enables them with updateAlert.
 */
export async function checkActiveAlerts(): Promise<number> {
  const alerts = await prisma.alert.findMany({
    where: { isActive: true, user: { isActive: true, deletedAt: null } },
    include: { asset: true },
  });

  const byAsset = new Map<string, typeof alerts>();
  for (const alert of alerts) {
    const list = byAsset.get(alert.assetId) ?? [];
    list.push(alert);
    byAsset.set(alert.assetId, list);
  }

  let triggered = 0;

  for (const assetAlerts of byAsset.values()) {
    const asset = assetAlerts[0]!.asset;
    let market: MarketSnapshot;
    try {
      market = await loadMarketSnapshot(asset);
    } catch (err) {
      console.error(`❌ Alert check: could not load market data for ${asset.symbol}:`, err);
      continue;
    }

    for (const alert of assetAlerts) {
      if (!(ALERT_CONDITIONS as readonly string[]).includes(alert.condition)) continue;
      const condition = alert.condition as AlertConditionValue;
      const target = Number(alert.targetValue);
      const observed = evaluateCondition(condition, target, market);
      if (observed == null) continue;

      // Conditional update so two overlapping job runs can't both fire the same alert.
      const { count } = await prisma.alert.updateMany({
        where: { id: alert.id, isActive: true },
        data: { isActive: false },
      });
      if (count === 0) continue;

      triggered += 1;
      notifyEvent(alert.userId, "ALERT_TRIGGERED", {
        embeds: [
          buildInvestmentEmbed({
            title: `🔔 ${asset.symbol}: ${CONDITION_LABEL[condition]} ${target}`,
            description: `ค่าปัจจุบัน: ${observed.toLocaleString()}`,
            color: 0xf1c40f,
            fields: [
              { name: "สินทรัพย์", value: asset.name, inline: true },
              { name: "เงื่อนไข", value: condition, inline: true },
            ],
          }),
        ],
      }).catch((err) => console.error("❌ Failed to send alert notification:", err));
    }
  }

  return triggered;
}
