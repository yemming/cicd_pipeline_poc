"use client";

import { useEffect, useMemo, useState } from "react";
import { useSetPageHeader } from "@/components/page-header-context";
import { getDayInfo } from "@/lib/lunar";
import type { HolidayEntry } from "@/lib/tw-holidays";
import { Heatmap, type HeatCell } from "@/components/charts/heatmap";

/**
 * T5 交車良辰吉時備忘錄
 *
 * 資料：
 *   - 取得今天起 45 天的 getDayInfo()，過濾出黃道日
 *   - 每日吉度 = 黃道(0.8) + 宜含「交易/出行/入宅」加權
 *   - 與 /api/holidays 合併，避開「忌」或補班
 *
 * 輸出：
 *   - Heatmap 顯示未來 6 週
 *   - 點一個日期 → 展開該日詳情 + 時辰建議
 *   - 交車 SOP 檢查清單
 */

const DELIVERY_KEYWORDS = ["出行", "交易", "立券", "納財", "入宅", "上樑"];

const SOP_ITEMS = [
  { key: "pre-delivery", label: "PDI 檢查表完成簽名" },
  { key: "polish",       label: "車身打蠟 + 電鍍件拋光" },
  { key: "gift",         label: "原廠交車禮盒（車衣、油蓋、徽章）備妥" },
  { key: "documents",    label: "行照、保險單、保固卡裝訂" },
  { key: "ceremony",     label: "紅毯、香檳、花束準備" },
  { key: "photo",        label: "交車紀念照拍攝 SOP 執行" },
  { key: "rally-call",   label: "通知車主同行親友、車隊陪伴" },
  { key: "explain",      label: "電控模式 / 騎乘設定講解 15 分鐘" },
  { key: "first-ride",   label: "陪騎 3 公里暖胎引導" },
  { key: "wave-off",     label: "送行揮手拍照存檔" },
];

function dateAdd(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function DeliveryTimingPage() {
  useSetPageHeader({
    title: "交車良辰吉時",
    hideSearch: true,
    breadcrumb: [{ label: "工具" }, { label: "擇日時序" }, { label: "交車良辰" }],
  });

  const [today, setToday] = useState<Date | null>(null);
  const [holidayMap, setHolidayMap] = useState<Record<string, HolidayEntry>>({});
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [sopChecked, setSopChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setToday(new Date());
  }, []);

  useEffect(() => {
    if (!today) return;
    const year = today.getFullYear();
    (async () => {
      try {
        const res = await fetch(`/api/holidays/${year}`);
        if (res.ok) setHolidayMap(await res.json());
      } catch {}
    })();
  }, [today]);

  const days = useMemo(() => {
    if (!today) return [];
    return Array.from({ length: 42 }, (_, i) => {
      const d = dateAdd(today, i);
      const info = getDayInfo(d.getFullYear(), d.getMonth() + 1, d.getDate());
      const k = dateKey(d);
      const holiday = holidayMap[k];
      // 吉度：黃道 0.55 起，符合交車關鍵字每個 +0.08
      let score = info.isAuspicious ? 0.6 : 0.25;
      const hits = info.yi.filter((t) => DELIVERY_KEYWORDS.some((k) => t.includes(k)));
      score += hits.length * 0.08;
      if (info.ji.some((t) => DELIVERY_KEYWORDS.some((k) => t.includes(k)))) score -= 0.25;
      if (holiday?.isWorkday) score -= 0.15;
      if (holiday?.isHoliday && !holiday.description) score += 0.05; // 一般假日交車無妨
      score = Math.max(0, Math.min(1, score));
      return { date: d, info, holiday, score, hits };
    });
  }, [today, holidayMap]);

  const cells: HeatCell[] = days.map((d) => ({
    date: dateKey(d.date),
    value: d.score,
    label: String(d.date.getDate()),
    onClick: () => setSelectedKey(dateKey(d.date)),
  }));

  // 若未選，預設最高分日
  const activeKey = selectedKey ?? days.reduce<string | null>(
    (best, d) => {
      if (!best) return dateKey(d.date);
      const bestDay = days.find((x) => dateKey(x.date) === best)!;
      return d.score > bestDay.score ? dateKey(d.date) : best;
    },
    null
  );
  const active = days.find((d) => dateKey(d.date) === activeKey);

  if (!today) {
    return (
      <div className="max-w-5xl mx-auto py-6 px-2">
        <div className="bg-white rounded-2xl p-10 text-center text-sm text-slate-400">
          載入中…
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto py-6 px-2 space-y-6">
      <section className="bg-gradient-to-br from-amber-50/60 via-white to-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400 mb-2">
          Delivery Ceremony Scheduler · 交車良辰吉時
        </div>
        <h2 className="text-2xl font-extrabold font-display text-on-surface tracking-tight">
          未來 6 週 · 黃道吉日熱力圖
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          連動農民曆 · 根據黃道黑道 + 宜忌關鍵字（出行/交易/納財/入宅）評分
        </p>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6">
        {/* Heatmap */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="grid grid-cols-7 gap-1.5 mb-2 text-center text-[10px] font-bold text-slate-400 tracking-wider">
            {["日", "一", "二", "三", "四", "五", "六"].map((w) => (
              <div key={w}>週{w}</div>
            ))}
          </div>
          {/* 補齊起始週的空格 */}
          <div className="flex items-start">
            <div className="w-full">
              <HeatmapWithBlanks
                today={today}
                cells={cells}
                activeKey={activeKey}
              />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3 text-[10px] text-slate-500">
            <span>低</span>
            <div className="flex gap-1">
              {[0, 0.25, 0.5, 0.75, 1].map((v) => (
                <div
                  key={v}
                  className="w-5 h-3 rounded"
                  style={{
                    backgroundColor:
                      v === 0 ? "#f1f5f9"
                      : v === 0.25 ? "#fef3c7"
                      : v === 0.5 ? "#fde68a"
                      : v === 0.75 ? "#fcd34d"
                      : "#F59E0B",
                  }}
                />
              ))}
            </div>
            <span>高</span>
            <span className="ml-4">｜點擊任一格查看詳情</span>
          </div>
        </div>

        {/* 詳情 */}
        {active && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-4xl font-extrabold font-display tracking-tight text-[#CC0000]">
                {active.date.getMonth() + 1}/{active.date.getDate()}
              </span>
              <span className="text-sm text-slate-500">
                {["日","一","二","三","四","五","六"][active.date.getDay()]}
              </span>
              <span
                className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full tracking-wider ${
                  active.info.isAuspicious ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"
                }`}
              >
                {active.info.tianShen}日
              </span>
            </div>
            <div className="text-xs text-slate-500 mb-4">
              農曆 {active.info.lunarYear} {active.info.lunarMonth}
              {active.info.lunarDay}　·　{active.info.ganZhi}
            </div>

            {active.hits.length > 0 && (
              <div className="mb-3 px-3 py-2 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold">
                <span className="material-symbols-outlined text-sm align-middle mr-1">check_circle</span>
                交車吉辭：{active.hits.join(" · ")}
              </div>
            )}
            {active.holiday?.description && active.holiday.isHoliday && (
              <div className="mb-3 px-3 py-2 bg-rose-50 text-rose-700 rounded-lg text-xs font-bold">
                國定假日：{active.holiday.description}
              </div>
            )}
            {active.holiday?.isWorkday && (
              <div className="mb-3 px-3 py-2 bg-orange-50 text-orange-700 rounded-lg text-xs font-bold">
                補班日 · 建議避開
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] font-bold text-emerald-700 tracking-wider mb-1.5">宜</div>
                <div className="flex flex-wrap gap-1">
                  {active.info.yi.slice(0, 6).map((t) => (
                    <span
                      key={t}
                      className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${
                        DELIVERY_KEYWORDS.some((k) => t.includes(k))
                          ? "bg-emerald-500 text-white"
                          : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-rose-700 tracking-wider mb-1.5">忌</div>
                <div className="flex flex-wrap gap-1">
                  {active.info.ji.slice(0, 6).map((t) => (
                    <span key={t} className="text-[11px] px-2 py-0.5 bg-rose-50 text-rose-700 rounded-md font-medium">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* 時辰吉凶（最佳 3 時辰） */}
            <div className="mt-5 pt-4 border-t border-slate-100">
              <div className="text-[10px] font-bold text-slate-500 tracking-widest mb-2">
                推薦交車時辰 TOP 3
              </div>
              <div className="grid grid-cols-3 gap-2">
                {active.info.times
                  .filter((t) => t.isAuspicious)
                  .slice(0, 3)
                  .map((t) => (
                    <div key={t.name} className="rounded-lg bg-amber-50/50 border border-amber-100 px-3 py-2 text-xs">
                      <div className="font-bold text-on-surface text-base">{t.name}時</div>
                      <div className="text-[10px] text-slate-500 font-mono">{t.range}</div>
                      <div className="text-[10px] text-emerald-700 mt-1 line-clamp-2">
                        {t.yi.slice(0, 3).join(" · ")}
                      </div>
                    </div>
                  ))}
                {active.info.times.filter((t) => t.isAuspicious).length === 0 && (
                  <div className="col-span-3 text-xs text-slate-400 italic">
                    此日黃道時辰較少，建議改擇其他日期
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                綜合吉度
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${active.score * 100}%`,
                      background: active.score >= 0.7 ? "#F59E0B" : active.score >= 0.4 ? "#FCD34D" : "#cbd5e1",
                    }}
                  />
                </div>
                <span className="text-sm font-bold text-on-surface tabular-nums">
                  {Math.round(active.score * 100)}
                </span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 交車 SOP */}
      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
          <h3 className="text-sm font-bold text-on-surface">交車儀式 SOP 檢查清單</h3>
          <span className="text-[10px] text-slate-500 font-mono">
            {Object.values(sopChecked).filter(Boolean).length} / {SOP_ITEMS.length}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
          {SOP_ITEMS.map((s, i) => {
            const checked = !!sopChecked[s.key];
            return (
              <label
                key={s.key}
                className={`flex items-center gap-3 px-6 py-3 border-b border-slate-100 cursor-pointer transition hover:bg-slate-50 ${
                  i % 2 === 0 ? "md:border-r" : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    setSopChecked((prev) => ({ ...prev, [s.key]: !prev[s.key] }))
                  }
                  className="w-4 h-4 accent-[#CC0000]"
                />
                <span className={`text-sm ${checked ? "text-slate-400 line-through" : "text-slate-700"}`}>
                  {s.label}
                </span>
              </label>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/** Heatmap 加補齊起始週空白的 wrapper */
function HeatmapWithBlanks({
  today, cells, activeKey,
}: { today: Date; cells: HeatCell[]; activeKey: string | null }) {
  const startDow = today.getDay();
  const blanks: HeatCell[] = Array.from({ length: startDow }, (_, i) => ({
    date: `blank-${i}`,
    value: 0,
    label: "",
    color: "transparent",
  }));
  const all = [...blanks, ...cells];
  return <Heatmap cells={all} activeDate={activeKey ?? undefined} cellSize={48} gap={6} />;
}
