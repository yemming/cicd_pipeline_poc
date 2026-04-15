"use client";

import { useEffect, useMemo, useState } from "react";
import { getDayInfo } from "@/lib/lunar";
import type { HolidayEntry } from "@/lib/tw-holidays";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function ClockWidget({ className = "" }: { className?: string }) {
  const [now, setNow] = useState<Date | null>(null);
  const [holidayMap, setHolidayMap] = useState<Record<string, HolidayEntry>>({});

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => {
      setNow((prev) => {
        const n = new Date();
        if (
          !prev ||
          n.getMinutes() !== prev.getMinutes() ||
          n.getDate() !== prev.getDate()
        ) {
          return n;
        }
        return prev;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // 取當年假日資料；跨年自動重抓
  useEffect(() => {
    if (!now) return;
    const year = now.getFullYear();
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/holidays/${year}`);
        if (!res.ok) return;
        const data = (await res.json()) as Record<string, HolidayEntry>;
        if (!cancelled) setHolidayMap(data);
      } catch {
        // graceful degradation
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [now?.getFullYear()]);

  const data = useMemo(() => {
    if (!now) return null;
    const info = getDayInfo(now.getFullYear(), now.getMonth() + 1, now.getDate());
    const hol = holidayMap[dateKey(now)] ?? null;
    return {
      timeStr: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
      dateStr: `${info.solarMonth}月${info.solarDay}日 週${WEEKDAYS[info.dayOfWeek]}`,
      lunarStr: `${info.lunarYear.split("（")[0]}年${info.lunarMonth}${info.lunarDay}`,
      yi: info.yi.slice(0, 4),
      ji: info.ji.slice(0, 4),
      tianShen: info.tianShen,
      isGood: info.isAuspicious,
      hol,
    };
  }, [now, holidayMap]);

  if (!data) {
    return <div className={`${className} min-w-0 h-full min-h-[172px]`} aria-hidden />;
  }

  return (
    <div
      className={`${className} flex flex-col items-center text-center bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-4 min-w-0 h-full`}
    >
      <div className="text-[11px] text-slate-500 font-medium tracking-wide">
        {data.dateStr} · {data.lunarStr}
      </div>
      <div className="text-6xl font-extrabold font-display text-on-surface leading-none tracking-tight mt-1 mb-3">
        {data.timeStr}
      </div>

      {/* 今日：國定假日 / 補班日 bar */}
      {data.hol?.description && data.hol.isHoliday && (
        <div className="mb-2 px-2 py-1 bg-rose-50 text-rose-700 rounded text-[11px] font-bold">
          今日：{data.hol.description}
        </div>
      )}
      {data.hol?.isWorkday && (
        <div className="mb-2 px-2 py-1 bg-orange-50 text-orange-700 rounded text-[11px] font-bold">
          今日：補班日{data.hol.description ? `（${data.hol.description}）` : ""}
        </div>
      )}

      <div className="h-px bg-slate-100 my-1 w-full" />
      <div className="self-stretch flex items-start gap-2 text-xs mt-2 text-left">
        <span className="px-1.5 py-0.5 rounded font-bold text-emerald-700 bg-emerald-50 shrink-0 leading-tight">宜</span>
        <span className="text-slate-700 leading-snug">
          {data.yi.length ? data.yi.join(" · ") : "—"}
        </span>
      </div>
      <div className="self-stretch flex items-center justify-between gap-2 text-xs mt-1.5 text-left">
        <div className="flex items-start gap-2">
          <span className="px-1.5 py-0.5 rounded font-bold text-rose-700 bg-rose-50 shrink-0 leading-tight">忌</span>
          <span className="text-slate-700 leading-snug">
            {data.ji.length ? data.ji.join(" · ") : "—"}
          </span>
        </div>
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded-full tracking-wider shrink-0 ${
            data.isGood ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
          }`}
        >
          {data.tianShen}日
        </span>
      </div>
    </div>
  );
}
