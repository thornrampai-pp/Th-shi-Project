"use client";

import { useEffect, useRef } from "react";

const WIDGET_SRC = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";

/** Free TradingView "Advanced Chart" embed; the widget script reads its config from its own body. */
export default function TradingViewChart({ symbol }: { symbol: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    widget.style.height = "100%";

    const script = document.createElement("script");
    script.src = WIDGET_SRC;
    script.async = true;
    script.textContent = JSON.stringify({
      symbol,
      autosize: true,
      interval: "D",
      timezone: "Asia/Bangkok",
      theme: "light",
      style: "1",
      locale: "en",
      allow_symbol_change: false,
      hide_side_toolbar: true,
      save_image: false,
    });

    container.replaceChildren(widget, script);
    return () => container.replaceChildren();
  }, [symbol]);

  return <div ref={containerRef} className="tradingview-widget-container h-full w-full" />;
}
