"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Holding } from "./data";

// Reference categorical order (validated against the --muted card surface); "Other"
// is a neutral so it never reads as a sixth series. Several slots sit below 3:1 on
// that surface, so the legend with percentages is always shown, not optional.
const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
const OTHER = "#a3a29d";
const MAX_SEGMENTS = SERIES.length;

const SIZE = 100;
const CENTER = SIZE / 2;
const STROKE = 14;
const RADIUS = (SIZE - STROKE) / 2;
const GAP = 1.2; // ≈2px at the rendered sizes, measured along the ring
const HIT_STROKE = STROKE + 6; // hover target wider than the visible mark

/** Point on the ring at `turn` (0–1, clockwise from 12 o'clock). */
function point(turn: number): string {
  const angle = turn * 2 * Math.PI - Math.PI / 2;
  return `${CENTER + RADIUS * Math.cos(angle)} ${CENTER + RADIUS * Math.sin(angle)}`;
}

/**
 * A real arc path, not a dashed full circle: browsers hit-test a dashed stroke as if
 * it were solid, so every slice drawn that way would claim hovers on the whole ring.
 */
function arcPath(start: number, end: number): string {
  const largeArc = end - start > 0.5 ? 1 : 0;
  return `M ${point(start)} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${point(end)}`;
}

type Segment = { key: string; label: string; weight: number; color: string };

function toSegments(holdings: Holding[]): Segment[] {
  const sorted = [...holdings].sort((a, b) => b.weight - a.weight);
  const top = sorted.slice(0, MAX_SEGMENTS);
  const rest = sorted.slice(MAX_SEGMENTS);
  const segments = top.map((h, i) => ({ key: h.assetId, label: h.symbol, weight: h.weight, color: SERIES[i] }));
  if (rest.length) {
    segments.push({
      key: "other",
      label: `Other (${rest.length})`,
      weight: rest.reduce((sum, h) => sum + h.weight, 0),
      color: OTHER,
    });
  }
  return segments;
}

type Props = { holdings: Holding[]; className?: string; legend?: "below" | "side" };

/** Part-to-whole of a portfolio's holdings by market value. */
export default function AllocationDonut({ holdings, className, legend = "below" }: Props) {
  const segments = toSegments(holdings);
  const [active, setActive] = useState<string | null>(null);
  const activeSegment = segments.find((s) => s.key === active);

  const total = segments.reduce((sum, s) => sum + s.weight, 0);
  const gapTurn = segments.length > 1 ? GAP / (2 * Math.PI * RADIUS) : 0;
  const arcs = segments.map((s, i) => {
    const start = segments.slice(0, i).reduce((sum, p) => sum + p.weight, 0) / total;
    const end = start + s.weight / total;
    return { ...s, start: start + gapTurn / 2, end: Math.max(end - gapTurn / 2, start + gapTurn / 2) };
  });
  // A single holding is a full ring, which one arc command can't draw.
  const fullRing = arcs.length === 1;

  return (
    <div className={cn("flex gap-4", legend === "side" ? "flex-col items-center sm:flex-row" : "flex-col items-center", className)}>
      <div className="relative aspect-square w-full max-w-44 shrink-0">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="size-full overflow-visible"
          role="img"
          aria-label={
            segments.length
              ? `Allocation: ${segments.map((s) => `${s.label} ${s.weight.toFixed(1)}%`).join(", ")}`
              : "No holdings"
          }
          onMouseLeave={() => setActive(null)}
        >
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke="var(--field)" strokeWidth={STROKE} />
          {arcs.map((a) => {
            const shape = fullRing
              ? { as: "circle" as const, props: { cx: CENTER, cy: CENTER, r: RADIUS } }
              : { as: "path" as const, props: { d: arcPath(a.start, a.end) } };
            const Shape = shape.as;
            return (
              <g key={a.key}>
                <Shape
                  {...shape.props}
                  fill="none"
                  stroke={a.color}
                  strokeWidth={STROKE}
                  pointerEvents="none"
                  className="transition-opacity"
                  opacity={active && active !== a.key ? 0.35 : 1}
                />
                {/* Invisible, wider band that owns the hover for this slice. */}
                <Shape
                  {...shape.props}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={HIT_STROKE}
                  pointerEvents="stroke"
                  onMouseEnter={() => setActive(a.key)}
                  onClick={() => setActive((k) => (k === a.key ? null : a.key))}
                />
              </g>
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {activeSegment ? (
            <>
              <span className="text-sm font-semibold">{activeSegment.label}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{activeSegment.weight.toFixed(1)}%</span>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">
              {holdings.length ? `${holdings.length} holding${holdings.length > 1 ? "s" : ""}` : "No holdings"}
            </span>
          )}
        </div>
      </div>

      {segments.length > 0 && (
        <ul className={cn("grid w-full gap-x-4 gap-y-1 text-xs", legend === "side" ? "max-w-56 grid-cols-1" : "grid-cols-2")}>
          {segments.map((s) => (
            <li
              key={s.key}
              onMouseEnter={() => setActive(s.key)}
              onMouseLeave={() => setActive(null)}
              className={cn("flex items-center gap-2 rounded px-1", active === s.key && "bg-background/60")}
            >
              <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} />
              <span className="min-w-0 flex-1 truncate">{s.label}</span>
              <span className="text-muted-foreground tabular-nums">{s.weight.toFixed(1)}%</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
