/**
 * KpiCard — 全站 KPI 卡片。
 *
 * 4 種 layout：
 *  - horizontal：icon 左、label+value 右、delta 在 value 旁
 *  - vertical：icon 頂、label / value / delta 上下排
 *  - mini：一條（無 icon、label + value inline、給密集 KPI 列用）
 *  - with-chart：上半 KPI、下半 mini chart slot（caller 透過 `sparkline` 注入）
 *
 * 視覺：白底 + border-tone-{tone}-100 + hover-lift + shadow-tone-{tone}；
 *      value 用 text-tone-{tone}-700 font-semibold。
 */

"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { TONE_CLASSES, cn, type ToneKey } from "./tone";

export interface KpiCardProps {
  label: string;
  value: string | number;
  delta?: {
    value: number;
    tone?: "positive" | "negative" | "neutral";
  };
  icon?: ReactNode;
  tone?: ToneKey;
  layout?: "horizontal" | "vertical" | "mini" | "with-chart";
  sparkline?: ReactNode;
  href?: string;
  className?: string;
}

function DeltaPill({ delta }: { delta: NonNullable<KpiCardProps["delta"]> }) {
  const auto: "positive" | "negative" | "neutral" =
    delta.tone ?? (delta.value > 0 ? "positive" : delta.value < 0 ? "negative" : "neutral");
  const cls =
    auto === "positive"
      ? "bg-tone-green-50 text-tone-green-700 border-tone-green-100"
      : auto === "negative"
      ? "bg-tone-red-50 text-tone-red-700 border-tone-red-100"
      : "bg-tone-gray-50 text-tone-gray-700 border-tone-gray-100";
  const arrow = auto === "positive" ? "▲" : auto === "negative" ? "▼" : "—";
  const sign = delta.value > 0 ? "+" : "";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[11px] font-medium border",
        cls,
      )}
    >
      <span>{arrow}</span>
      <span>
        {sign}
        {delta.value}%
      </span>
    </span>
  );
}

export function KpiCard({
  label,
  value,
  delta,
  icon,
  tone = "blue",
  layout = "horizontal",
  sparkline,
  href,
  className,
}: KpiCardProps) {
  const t = TONE_CLASSES[tone];

  const base = cn(
    "block bg-white rounded-lg border",
    t.border100,
    "hover-lift",
    t.shadowTone ? `hover:${t.shadowTone}` : "",
    className,
  );

  let inner: ReactNode;

  if (layout === "mini") {
    inner = (
      <div className="px-3 py-2 flex items-center gap-2 min-w-0">
        <span className="text-[11px] text-tone-gray-500 truncate">{label}</span>
        <span className={cn("text-[14px] font-semibold ml-auto", t.text700)}>{value}</span>
        {delta ? <DeltaPill delta={delta} /> : null}
      </div>
    );
  } else if (layout === "vertical") {
    inner = (
      <div className="px-4 py-4 flex flex-col gap-2">
        {icon ? (
          <div className={cn("w-9 h-9 rounded-md flex items-center justify-center", t.bg50, t.text700)}>
            {icon}
          </div>
        ) : null}
        <div className="text-[11px] text-tone-gray-500">{label}</div>
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className={cn("text-[24px] font-semibold leading-none", t.text700)}>{value}</span>
          {delta ? <DeltaPill delta={delta} /> : null}
        </div>
      </div>
    );
  } else if (layout === "with-chart") {
    inner = (
      <div className="flex flex-col">
        <div className="px-4 pt-4 pb-2 flex items-start gap-3">
          {icon ? (
            <div className={cn("w-9 h-9 rounded-md flex items-center justify-center shrink-0", t.bg50, t.text700)}>
              {icon}
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="text-[11px] text-tone-gray-500">{label}</div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className={cn("text-[22px] font-semibold leading-none", t.text700)}>{value}</span>
              {delta ? <DeltaPill delta={delta} /> : null}
            </div>
          </div>
        </div>
        {sparkline ? <div className="px-2 pb-2">{sparkline}</div> : null}
      </div>
    );
  } else {
    // horizontal (default)
    inner = (
      <div className="px-4 py-3 flex items-center gap-3">
        {icon ? (
          <div className={cn("w-10 h-10 rounded-md flex items-center justify-center shrink-0", t.bg50, t.text700)}>
            {icon}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="text-[11px] text-tone-gray-500">{label}</div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className={cn("text-[20px] font-semibold leading-none", t.text700)}>{value}</span>
            {delta ? <DeltaPill delta={delta} /> : null}
          </div>
        </div>
      </div>
    );
  }

  if (href) {
    return (
      <Link href={href} className={base}>
        {inner}
      </Link>
    );
  }

  return <div className={base}>{inner}</div>;
}

export default KpiCard;
