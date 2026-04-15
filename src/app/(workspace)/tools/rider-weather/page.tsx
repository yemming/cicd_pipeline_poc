"use client";

import { useEffect, useState } from "react";
import { useSetPageHeader } from "@/components/page-header-context";
import { LineArea } from "@/components/charts/line-area";
import { RadialGauge } from "@/components/charts/radial-gauge";

interface HourlyPoint {
  time: string; hour: number; tempC: number; feelsLikeC: number;
  humidity: number; precipProb: number; precipMm: number;
  windKmh: number; weatherCode: number; riderScore: number;
}
interface WeatherResponse {
  location: { lat: number; lng: number; label: string };
  current: { tempC: number; feelsLikeC: number; code: number; windKmh: number };
  hourly: HourlyPoint[];
  warmupSuggestion: string;
}

const WEATHER_LABELS: Record<number, { label: string; icon: string }> = {
  0:  { label: "晴朗",         icon: "sunny" },
  1:  { label: "大致晴朗",     icon: "clear_day" },
  2:  { label: "局部多雲",     icon: "partly_cloudy_day" },
  3:  { label: "陰天",         icon: "cloud" },
  45: { label: "有霧",         icon: "foggy" },
  48: { label: "凝霧",         icon: "foggy" },
  51: { label: "毛毛雨",       icon: "rainy" },
  53: { label: "小毛毛雨",     icon: "rainy" },
  55: { label: "大毛毛雨",     icon: "rainy" },
  61: { label: "小雨",         icon: "rainy" },
  63: { label: "中雨",         icon: "rainy" },
  65: { label: "大雨",         icon: "rainy" },
  80: { label: "陣雨",         icon: "rainy" },
  81: { label: "強陣雨",       icon: "rainy" },
  82: { label: "暴雨",         icon: "thunderstorm" },
  95: { label: "雷雨",         icon: "thunderstorm" },
  96: { label: "雷雨冰雹",     icon: "thunderstorm" },
  99: { label: "強雷雨",       icon: "thunderstorm" },
};

const weatherOf = (code: number) =>
  WEATHER_LABELS[code] ?? { label: "未知", icon: "question_mark" };

export default function RiderWeatherPage() {
  useSetPageHeader({
    title: "騎士氣象",
    hideSearch: true,
    breadcrumb: [{ label: "工具" }, { label: "擇日時序" }, { label: "騎士氣象" }],
  });

  const [data, setData] = useState<WeatherResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/weather");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = (await res.json()) as WeatherResponse;
        if (!cancelled) setData(d);
      } catch (e) {
        if (!cancelled) setErr(String(e));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (err) {
    return (
      <div className="max-w-5xl mx-auto py-6 px-2">
        <div className="bg-rose-50 text-rose-700 rounded-xl p-6 text-sm">
          天氣資料暫時不可用：{err}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-5xl mx-auto py-6 px-2">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center text-sm text-slate-400">
          正在向 Open-Meteo 問天…
        </div>
      </div>
    );
  }

  const next12 = data.hourly.slice(0, 12);
  const todayBest = data.hourly.reduce<HourlyPoint | null>(
    (best, h) => (!best || h.riderScore > best.riderScore ? h : best),
    null
  );
  const currentScore = data.hourly[0]?.riderScore ?? 0;
  const w = weatherOf(data.current.code);

  return (
    <div className="max-w-[1200px] mx-auto py-6 px-2 space-y-6">
      {/* 頂部：現況 + 適合度 */}
      <section className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
        <div className="bg-gradient-to-br from-sky-50 via-white to-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400 mb-2">
            Rider Weather · {data.location.label}
          </div>
          <div className="flex items-center gap-6">
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 96, color: "#0891B2" }}
            >
              {w.icon}
            </span>
            <div>
              <div className="text-[56px] font-extrabold font-display leading-none text-on-surface tabular-nums">
                {Math.round(data.current.tempC)}°
              </div>
              <div className="text-sm text-slate-500 mt-1">
                體感 {Math.round(data.current.feelsLikeC)}° · {w.label} · 風速 {Math.round(data.current.windKmh)} km/h
              </div>
            </div>
          </div>
          <div className="mt-6 bg-amber-50 border-l-4 border-amber-400 rounded-r-lg px-4 py-3 text-sm text-amber-900 font-medium">
            <span className="material-symbols-outlined text-base align-middle mr-1">local_fire_department</span>
            {data.warmupSuggestion}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col items-center justify-center">
          <RadialGauge
            size={240}
            value={currentScore}
            label="出車適合度"
            sublabel={
              currentScore >= 80 ? "吉時 · 速速出發" :
              currentScore >= 60 ? "小吉 · 可以考慮" :
              currentScore >= 40 ? "中平 · 小心為上" :
              "凶時 · 留車在家"
            }
            color={
              currentScore >= 80 ? "#059669" :
              currentScore >= 60 ? "#F59E0B" :
              currentScore >= 40 ? "#C9A84C" :
              "#DC2626"
            }
          />
        </div>
      </section>

      {/* 時序曲線 */}
      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">
              未來 24 小時 · 每小時騎士適合度
            </div>
            <h3 className="text-sm font-bold text-on-surface">
              分數 70+ 為建議出車時段
            </h3>
          </div>
          {todayBest && (
            <div className="text-xs text-slate-500">
              今日最佳：
              <strong className="text-emerald-600 ml-1">
                {String(todayBest.hour).padStart(2, "0")}:00
              </strong>
              <span className="ml-1 font-mono">({todayBest.riderScore})</span>
            </div>
          )}
        </div>
        <LineArea
          data={data.hourly.map((h) => ({ x: h.hour, y: h.riderScore }))}
          color="#0891B2"
          height={240}
          width={1000}
          xLabel={(p) => `${String(p.x).padStart(2, "0")}:00`}
          yFormat={(v) => v.toString()}
        />
      </section>

      {/* 未來 12 小時明細 */}
      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/60">
          <h3 className="text-sm font-bold text-on-surface">未來 12 小時逐時明細</h3>
        </div>
        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-6">
          {next12.map((h, i) => {
            const ww = weatherOf(h.weatherCode);
            const good = h.riderScore >= 70;
            const bad = h.riderScore < 40;
            return (
              <div
                key={i}
                className={`p-4 border-r border-b border-slate-100 flex flex-col items-center text-center ${
                  good ? "bg-emerald-50/40" : bad ? "bg-rose-50/30" : ""
                }`}
              >
                <div className="text-[11px] text-slate-400 font-mono">
                  {String(h.hour).padStart(2, "0")}:00
                </div>
                <span
                  className="material-symbols-outlined my-2"
                  style={{ fontSize: 32, color: good ? "#059669" : bad ? "#DC2626" : "#0891B2" }}
                >
                  {ww.icon}
                </span>
                <div className="text-2xl font-extrabold font-display text-on-surface tabular-nums leading-none">
                  {Math.round(h.tempC)}°
                </div>
                <div className="text-[10px] text-slate-500 mt-1">{ww.label}</div>
                <div
                  className={`mt-2 text-[11px] font-black px-2 py-0.5 rounded-full tracking-wider ${
                    good ? "bg-emerald-500 text-white" : bad ? "bg-rose-500 text-white" : "bg-slate-200 text-slate-700"
                  }`}
                >
                  {h.riderScore}
                </div>
                {h.precipProb > 0 && (
                  <div className="text-[10px] text-sky-600 mt-1">
                    降雨 {h.precipProb}%
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <div className="text-[10px] text-slate-400 text-center">
        Data · <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" className="underline">Open-Meteo</a>
        （非商用免費氣象 API、每 30 分鐘 ISR 快取）
      </div>
    </div>
  );
}
