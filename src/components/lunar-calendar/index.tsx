"use client";

import { useEffect, useMemo, useState } from "react";
import { getDayInfo, getMonthDays, type DayInfo, type TimeInfo } from "@/lib/lunar";
import type { HolidayEntry } from "@/lib/tw-holidays";

interface LunarCalendarProps {
  initialYear?: number;
  initialMonth?: number;
  onDateSelect?: (day: DayInfo) => void;
  className?: string;
}

const WEEK_HEADERS = ["日", "一", "二", "三", "四", "五", "六"];

const dateKey = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export default function LunarCalendar({
  initialYear,
  initialMonth,
  onDateSelect,
  className = "",
}: LunarCalendarProps) {
  const [today, setToday] = useState<{ y: number; m: number; d: number } | null>(null);

  useEffect(() => {
    const t = new Date();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToday({ y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() });
  }, []);

  const [year, setYear] = useState(initialYear ?? new Date().getFullYear());
  const [month, setMonth] = useState(initialMonth ?? new Date().getMonth() + 1);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [holidayMap, setHolidayMap] = useState<Record<string, HolidayEntry>>({});

  useEffect(() => {
    if (today && year === today.y && month === today.m && !selectedKey) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedKey(dateKey(today.y, today.m, today.d));
    }
  }, [today, year, month, selectedKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/holidays/${year}`);
        if (!res.ok) return;
        const data = (await res.json()) as Record<string, HolidayEntry>;
        if (!cancelled) setHolidayMap(data);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [year]);

  const monthDays = useMemo(() => getMonthDays(year, month), [year, month]);
  const firstDow = new Date(year, month - 1, 1).getDay();
  const leadingBlanks = Array.from({ length: firstDow }, (_, i) => i);

  const selectedDay: DayInfo | null = useMemo(() => {
    if (!selectedKey) return null;
    const [sy, sm, sd] = selectedKey.split("-").map(Number);
    return getDayInfo(sy, sm, sd);
  }, [selectedKey]);

  const selectedHoliday = selectedKey ? holidayMap[selectedKey] ?? null : null;

  // ── 導覽 ──
  const shiftMonth = (delta: number) => {
    let nm = month + delta;
    let ny = year;
    while (nm < 1) { nm += 12; ny -= 1; }
    while (nm > 12) { nm -= 12; ny += 1; }
    setYear(ny);
    setMonth(nm);
  };
  const shiftYear = (delta: number) => setYear((y) => y + delta);
  const goToday = () => {
    if (!today) return;
    setYear(today.y);
    setMonth(today.m);
    setSelectedKey(dateKey(today.y, today.m, today.d));
  };
  const shiftDay = (delta: number) => {
    if (!selectedDay) return;
    const d = new Date(selectedDay.solarYear, selectedDay.solarMonth - 1, selectedDay.solarDay);
    d.setDate(d.getDate() + delta);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
    setSelectedKey(dateKey(d.getFullYear(), d.getMonth() + 1, d.getDate()));
  };

  const handleSelect = (day: DayInfo) => {
    const k = dateKey(day.solarYear, day.solarMonth, day.solarDay);
    setSelectedKey(k);
    onDateSelect?.(day);
  };

  return (
    <div className={`${className} grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,440px)] gap-6 items-start`}>
      {/* 月曆 */}
      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden xl:sticky xl:top-20">
        {/* Nav bar */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <NavArrow onClick={() => shiftYear(-1)} label="前一年" glyph="keyboard_double_arrow_left" />
            <NavArrow onClick={() => shiftMonth(-1)} label="上月" glyph="chevron_left" />
            <div className="px-3 flex items-baseline gap-1.5 select-none">
              <span className="text-2xl font-extrabold font-display text-on-surface tracking-tight">
                {year}
              </span>
              <span className="text-sm text-slate-400 font-medium">年</span>
              <span className="ml-2 text-2xl font-extrabold font-display text-[#CC0000] tracking-tight">
                {month}
              </span>
              <span className="text-sm text-slate-400 font-medium">月</span>
            </div>
            <NavArrow onClick={() => shiftMonth(1)} label="下月" glyph="chevron_right" />
            <NavArrow onClick={() => shiftYear(1)} label="後一年" glyph="keyboard_double_arrow_right" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium hidden sm:inline">
              {monthDays[0]?.lunarYear}
            </span>
            <button
              onClick={goToday}
              className="px-3 py-1.5 text-xs font-bold bg-[#CC0000]/10 text-[#CC0000] rounded-lg hover:bg-[#CC0000]/20 transition"
            >
              返回今日
            </button>
          </div>
        </div>

        {/* Weekday header */}
        <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/60">
          {WEEK_HEADERS.map((w, i) => (
            <div
              key={w}
              className={`py-2 text-center text-[11px] font-bold tracking-wider ${
                i === 0 ? "text-rose-500" : i === 6 ? "text-sky-500" : "text-slate-500"
              }`}
            >
              週{w}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7">
          {leadingBlanks.map((i) => (
            <div
              key={`blank-${i}`}
              className="h-28 border-r border-b border-slate-100 last:border-r-0 bg-slate-50/30"
            />
          ))}
          {monthDays.map((day, idx) => {
            const k = dateKey(day.solarYear, day.solarMonth, day.solarDay);
            const isToday =
              today && today.y === day.solarYear && today.m === day.solarMonth && today.d === day.solarDay;
            const isSelected = selectedKey === k;
            const isSun = day.dayOfWeek === 0;
            const isSat = day.dayOfWeek === 6;
            const isEndOfRow = (leadingBlanks.length + idx + 1) % 7 === 0;

            const hol = holidayMap[k];
            const holName = hol?.description ?? "";
            const isRedDay = hol?.isHoliday ?? false;
            const isMakeupWork = hol?.isWorkday ?? false;

            let dayNumColor = "text-on-surface";
            if (isRedDay) dayNumColor = "text-rose-500";
            else if (!isMakeupWork && isSun) dayNumColor = "text-rose-500";
            else if (!isMakeupWork && isSat) dayNumColor = "text-sky-500";

            return (
              <button
                key={k}
                onClick={() => handleSelect(day)}
                className={`relative h-28 p-2 text-left border-b border-slate-100 transition group flex flex-col ${
                  isEndOfRow ? "" : "border-r"
                } ${
                  isSelected
                    ? "bg-[#CC0000]/5 ring-2 ring-inset ring-[#CC0000]"
                    : "hover:bg-slate-50"
                } ${isToday && !isSelected ? "ring-1 ring-inset ring-[#CC0000]/40" : ""}`}
              >
                {/* 右上：補班 / 黃道 */}
                {isMakeupWork ? (
                  <span className="absolute top-1 right-1 text-[9px] font-black px-1 py-px rounded bg-orange-500 text-white leading-none">
                    補
                  </span>
                ) : day.isAuspicious ? (
                  <span
                    className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-amber-400"
                    aria-label="黃道吉日"
                  />
                ) : null}

                {/* 左上：公曆大數字 */}
                <div className="flex items-baseline gap-1">
                  <div className={`text-2xl font-extrabold font-display leading-none ${dayNumColor}`}>
                    {day.solarDay}
                  </div>
                  {isToday && (
                    <span className="text-[9px] font-black text-[#CC0000] tracking-wider">今</span>
                  )}
                </div>

                {/* 農曆 */}
                <div className="mt-auto space-y-0.5 text-[10px] leading-tight">
                  <div className="text-slate-500 font-medium">
                    {day.lunarDay === "初一" ? day.lunarMonth : day.lunarDay}
                  </div>
                  {day.jieQi && (
                    <div className="text-emerald-600 font-semibold">{day.jieQi}</div>
                  )}
                  {holName && (
                    <div className="text-rose-500 font-semibold truncate">{holName}</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 border-t border-slate-100 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> 黃道吉日
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> 節氣
          </span>
          <span className="inline-flex items-center gap-1 text-rose-500">● 國定假日 / 週日</span>
          <span className="inline-flex items-center gap-1 text-sky-500">● 週六</span>
          <span className="inline-flex items-center gap-1">
            <span className="text-[9px] font-black px-1 py-px rounded bg-orange-500 text-white leading-none">補</span>
            補班日
          </span>
        </div>
      </section>

      {/* 當日詳情 */}
      {selectedDay && (
        <DetailSection
          day={selectedDay}
          holiday={selectedHoliday}
          onPrev={() => shiftDay(-1)}
          onNext={() => shiftDay(1)}
        />
      )}
    </div>
  );
}

function NavArrow({ onClick, label, glyph }: { onClick: () => void; label: string; glyph: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="p-1.5 text-slate-500 hover:text-[#CC0000] hover:bg-slate-100 rounded-lg transition"
    >
      <span className="material-symbols-outlined text-lg">{glyph}</span>
    </button>
  );
}

function DetailSection({
  day,
  holiday,
  onPrev,
  onNext,
}: {
  day: DayInfo;
  holiday: HolidayEntry | null;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      {/* Detail nav bar */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50/60 to-transparent">
        <button
          onClick={onPrev}
          className="p-2 text-slate-500 hover:text-[#CC0000] hover:bg-white rounded-lg transition inline-flex items-center gap-1 text-sm"
        >
          <span className="material-symbols-outlined text-base">chevron_left</span>
          前一天
        </button>
        <div className="text-center">
          <div className="flex items-baseline justify-center gap-1 font-display">
            <span className="text-slate-400 text-sm">國曆</span>
            <span className="text-2xl font-extrabold text-on-surface tracking-tight">
              {day.solarYear}
            </span>
            <span className="text-sm text-slate-400">年</span>
            <span className="text-2xl font-extrabold text-on-surface tracking-tight">
              {day.solarMonth}
            </span>
            <span className="text-sm text-slate-400">月</span>
            <span className="text-2xl font-extrabold text-[#CC0000] tracking-tight">
              {day.solarDay}
            </span>
            <span className="text-sm text-slate-400">日 週{WEEK_HEADERS[day.dayOfWeek]}</span>
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            農曆 {day.lunarYear} {day.lunarMonth}
            {day.lunarDay}
          </div>
        </div>
        <button
          onClick={onNext}
          className="p-2 text-slate-500 hover:text-[#CC0000] hover:bg-white rounded-lg transition inline-flex items-center gap-1 text-sm"
        >
          後一天
          <span className="material-symbols-outlined text-base">chevron_right</span>
        </button>
      </div>

      {/* Top banners */}
      <div className="px-5 pt-4 space-y-2">
        {holiday?.description && holiday.isHoliday && (
          <div className="px-3 py-2 bg-rose-50 text-rose-700 rounded-lg text-xs font-bold">
            今日：{holiday.description}
          </div>
        )}
        {holiday?.isWorkday && (
          <div className="px-3 py-2 bg-orange-50 text-orange-700 rounded-lg text-xs font-bold">
            今日：補班日{holiday.description ? `（${holiday.description}）` : ""}
          </div>
        )}
        {day.jieQiPeriod && (
          <div className="px-3 py-2 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold inline-flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">eco</span>
            節氣：{day.jieQiPeriod.name}（{day.jieQiPeriod.from} – {day.jieQiPeriod.to}）
          </div>
        )}
      </div>

      {/* 三柱 + 黃道徽章 */}
      <div className="px-5 pt-4 flex flex-wrap items-center gap-3">
        <span className="px-2.5 py-1 bg-slate-100 text-on-surface rounded-lg text-xs font-bold tracking-wider">
          {day.yearGanZhi}
        </span>
        <span className="px-2.5 py-1 bg-slate-100 text-on-surface rounded-lg text-xs font-bold tracking-wider">
          {day.monthGanZhi}
        </span>
        <span className="px-2.5 py-1 bg-[#1A1A2E] text-white rounded-lg text-xs font-bold tracking-wider">
          {day.ganZhi}
        </span>
        <span
          className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full tracking-wider ${
            day.isAuspicious ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"
          }`}
        >
          {day.tianShen}日
        </span>
      </div>

      {/* 宜 / 忌 */}
      <div className="grid grid-cols-1 gap-3 px-5 py-4">
        <YiJiBlock kind="yi" items={day.yi} />
        <YiJiBlock kind="ji" items={day.ji} />
      </div>

      {/* 神煞 / 方位 */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-5 pb-4 text-xs border-t border-slate-100 pt-4">
        {day.chong && <Row label="沖煞" value={day.chong} />}
        <Row label="喜神" value={day.positionXi} />
        <Row label="福神" value={day.positionFu} />
        <Row label="財神" value={day.positionCai} />
        {day.jiShen.length > 0 && (
          <Row label="吉神" value={day.jiShen.slice(0, 6).join(" · ")} span2 />
        )}
        {day.pengZu.length > 0 && (
          <Row label="彭祖" value={day.pengZu.join("　")} span2 />
        )}
      </div>

      {/* 12 時辰 */}
      <div className="border-t border-slate-100">
        <div className="px-5 py-3 flex items-center gap-2 bg-slate-50/60">
          <span className="material-symbols-outlined text-sm text-slate-400">schedule</span>
          <h3 className="text-sm font-bold text-on-surface tracking-wide">十二時辰吉凶</h3>
          <span className="text-[11px] text-slate-400">（古時辰，每兩小時為一時辰）</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3">
          {day.times.map((t) => (
            <TimeCell key={t.name} time={t} />
          ))}
        </div>
      </div>
    </section>
  );
}

function YiJiBlock({ kind, items }: { kind: "yi" | "ji"; items: string[] }) {
  const isYi = kind === "yi";
  return (
    <div
      className={`rounded-xl border p-4 ${
        isYi ? "border-emerald-100 bg-emerald-50/30" : "border-rose-100 bg-rose-50/30"
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span
          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-white ${
            isYi ? "bg-emerald-500" : "bg-rose-500"
          }`}
        >
          {isYi ? "宜" : "忌"}
        </span>
        <span className="text-xs text-slate-500 font-medium">
          {isYi ? "可做之事" : "不宜之事"}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.length ? (
          items.map((t) => (
            <span
              key={t}
              className={`text-xs px-2 py-0.5 rounded-md font-medium ${
                isYi ? "bg-white text-emerald-700 border border-emerald-100" : "bg-white text-rose-700 border border-rose-100"
              }`}
            >
              {t}
            </span>
          ))
        ) : (
          <span className="text-xs text-slate-400">—</span>
        )}
      </div>
    </div>
  );
}

function TimeCell({ time }: { time: TimeInfo }) {
  return (
    <div className="p-3 border-r border-b border-slate-100 last:border-r-0">
      <div className="flex items-baseline justify-between mb-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-lg font-extrabold font-display text-on-surface leading-none">
            {time.name}
          </span>
          <span className="text-[10px] text-slate-400">{time.ganZhi}</span>
        </div>
        <span
          className={`text-[9px] font-bold px-1.5 py-px rounded ${
            time.isAuspicious ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"
          }`}
        >
          {time.tianShen}
        </span>
      </div>
      <div className="text-[10px] text-slate-400 font-mono mb-1.5">{time.range}</div>

      <div className="space-y-0.5 text-[10px] leading-snug">
        <div className="flex gap-1">
          <span className="font-bold text-emerald-600 shrink-0">宜</span>
          <span className="text-slate-600 line-clamp-2">
            {time.yi.length ? time.yi.slice(0, 4).join("·") : "—"}
          </span>
        </div>
        <div className="flex gap-1">
          <span className="font-bold text-rose-600 shrink-0">忌</span>
          <span className="text-slate-600 line-clamp-2">
            {time.ji.length ? time.ji.slice(0, 4).join("·") : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, span2 }: { label: string; value: string; span2?: boolean }) {
  return (
    <div className={`flex items-start gap-2 ${span2 ? "col-span-2" : ""}`}>
      <span className="text-slate-400 shrink-0 w-10">{label}</span>
      <span className="text-slate-700 break-all">{value || "—"}</span>
    </div>
  );
}
