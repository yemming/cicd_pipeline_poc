"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { getDayInfo } from "@/lib/lunar";
import type { HolidayEntry } from "@/lib/tw-holidays";
import { codeToKind, kindLabel, type WeatherKind } from "@/lib/weather-kind";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

type SkyKind = "sunrise" | "day" | "sunset" | "night";

function getSkyTheme(h: number): { kind: SkyKind } {
  if (h >= 5 && h < 10) return { kind: "sunrise" };
  if (h >= 10 && h < 17) return { kind: "day" };
  if (h >= 17 && h < 19) return { kind: "sunset" };
  return { kind: "night" };
}

// 放射 tint：中心淡色 → 邊緣 transparent，融入白底
function getRadialTint(kind: SkyKind): string {
  const cx = "72% 38%"; // 天體附近
  switch (kind) {
    case "sunrise":
      return `radial-gradient(ellipse 70% 80% at ${cx}, rgba(253,230,138,0.28), rgba(254,205,211,0.18) 40%, transparent 75%)`;
    case "day":
      return `radial-gradient(ellipse 75% 85% at ${cx}, rgba(186,230,253,0.32), rgba(191,219,254,0.18) 45%, transparent 78%)`;
    case "sunset":
      return `radial-gradient(ellipse 70% 80% at ${cx}, rgba(254,215,170,0.32), rgba(253,186,192,0.20) 45%, transparent 78%)`;
    case "night":
      return `radial-gradient(ellipse 75% 85% at ${cx}, rgba(199,210,254,0.35), rgba(186,213,240,0.18) 45%, transparent 80%)`;
  }
}

const STARS = [
  { top: "top-7",  left: "left-12", size: "w-1 h-1",       delay: 0,   dur: 2.6 },
  { top: "top-16", left: "left-28", size: "w-0.5 h-0.5",   delay: 0.8, dur: 3.2 },
  { top: "top-3",  left: "left-44", size: "w-1 h-1",       delay: 1.4, dur: 2.2 },
  { top: "top-20", left: "left-16", size: "w-0.5 h-0.5",   delay: 0.4, dur: 2.8 },
  { top: "top-24", left: "left-36", size: "w-1 h-1",       delay: 1.8, dur: 3.0 },
];

function Celestial({ kind }: { kind: SkyKind }) {
  if (kind === "night") {
    return (
      <>
        <motion.div
          className="absolute top-4 right-6 w-16 h-16 rounded-full bg-gradient-to-br from-slate-50 to-slate-300 shadow-[0_0_50px_rgba(203,213,225,0.9)]"
          animate={{ y: [0, -3, 0], scale: [1, 1.03, 1] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          aria-hidden
        />
        <div className="absolute top-6 right-10 w-2 h-2 rounded-full bg-slate-400/50" aria-hidden />
        <div className="absolute top-10 right-8 w-1.5 h-1.5 rounded-full bg-slate-400/40" aria-hidden />
        {STARS.map((s, i) => (
          <motion.div
            key={i}
            className={`absolute ${s.top} ${s.left} ${s.size} rounded-full bg-white`}
            animate={{ opacity: [0.25, 1, 0.25], scale: [0.8, 1.1, 0.8] }}
            transition={{ duration: s.dur, repeat: Infinity, delay: s.delay, ease: "easeInOut" }}
            aria-hidden
          />
        ))}
      </>
    );
  }
  const palette =
    kind === "day"
      ? "from-yellow-200 to-amber-300 shadow-[0_0_60px_rgba(251,191,36,0.7)]"
      : kind === "sunrise"
        ? "from-rose-200 to-orange-300 shadow-[0_0_50px_rgba(251,146,60,0.6)]"
        : "from-orange-300 to-rose-400 shadow-[0_0_50px_rgba(244,114,182,0.6)]";
  const position = kind === "day" ? "top-4 right-8" : kind === "sunrise" ? "top-8 right-10" : "top-12 right-12";
  return (
    <motion.div
      className={`absolute ${position} w-14 h-14 rounded-full bg-gradient-to-br ${palette}`}
      animate={{ scale: [1, 1.06, 1], opacity: [0.92, 1, 0.92] }}
      transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
      aria-hidden
    />
  );
}

const CLOUDS = [
  { cls: "-top-8 -left-4 w-44 h-20 bg-white/80 blur-2xl",   drift: 32, dur: 28 },
  { cls: "top-8 left-20 w-40 h-14 bg-white/60 blur-xl",     drift: -24, dur: 34 },
  { cls: "bottom-2 -right-10 w-52 h-18 bg-white/70 blur-2xl", drift: 26, dur: 38 },
  { cls: "bottom-6 left-6 w-36 h-12 bg-white/60 blur-xl",   drift: -18, dur: 24 },
];

// ==== 天氣特效層 ====
const RAIN_LINES = Array.from({ length: 14 }, (_, i) => ({
  left: `${6 + i * 7}%`,
  delay: (i * 0.17) % 1.4,
  dur: 0.9 + ((i * 0.13) % 0.6),
}));

const SNOW_DOTS = Array.from({ length: 12 }, (_, i) => ({
  left: `${8 + i * 8}%`,
  delay: (i * 0.4) % 3,
  dur: 5 + ((i * 0.7) % 3),
  size: i % 3 === 0 ? "w-1.5 h-1.5" : "w-1 h-1",
}));

function WeatherFX({ kind }: { kind: WeatherKind }) {
  if (kind === "rain" || kind === "thunder") {
    return (
      <>
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
          {RAIN_LINES.map((r, i) => (
            <motion.span
              key={i}
              className="absolute top-0 w-px h-6 bg-gradient-to-b from-transparent via-sky-400/50 to-sky-500/70"
              style={{ left: r.left }}
              animate={{ y: ["-10%", "120%"] }}
              transition={{
                duration: r.dur,
                delay: r.delay,
                repeat: Infinity,
                ease: "linear",
              }}
            />
          ))}
        </div>
        {kind === "thunder" && (
          <motion.div
            className="absolute inset-0 bg-white pointer-events-none"
            animate={{ opacity: [0, 0, 0.7, 0, 0.4, 0] }}
            transition={{
              duration: 0.9,
              repeat: Infinity,
              repeatDelay: 6 + Math.random() * 4,
              times: [0, 0.85, 0.88, 0.91, 0.94, 1],
            }}
            aria-hidden
          />
        )}
      </>
    );
  }
  if (kind === "snow") {
    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        {SNOW_DOTS.map((s, i) => (
          <motion.span
            key={i}
            className={`absolute top-0 ${s.size} rounded-full bg-white/90`}
            style={{ left: s.left }}
            animate={{ y: ["-10%", "115%"], x: [0, 8, -8, 0] }}
            transition={{
              y: { duration: s.dur, delay: s.delay, repeat: Infinity, ease: "linear" },
              x: { duration: s.dur, delay: s.delay, repeat: Infinity, ease: "easeInOut" },
            }}
          />
        ))}
      </div>
    );
  }
  if (kind === "fog") {
    return (
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(180deg, rgba(226,232,240,0.35) 0%, rgba(255,255,255,0.55) 50%, rgba(226,232,240,0.35) 100%)",
          backdropFilter: "blur(1.5px)",
        }}
        animate={{ opacity: [0.55, 0.8, 0.55] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden
      />
    );
  }
  return null;
}

function ExtraClouds({ kind }: { kind: WeatherKind }) {
  if (kind === "clear") return null;
  const extra = kind === "overcast" || kind === "rain" || kind === "thunder"
    ? [
        { cls: "top-2 left-1/4 w-56 h-16 bg-slate-300/60 blur-2xl", drift: 20, dur: 32 },
        { cls: "top-10 right-4 w-48 h-14 bg-slate-300/50 blur-2xl", drift: -22, dur: 36 },
        { cls: "bottom-4 left-1/3 w-60 h-18 bg-slate-400/40 blur-2xl", drift: 16, dur: 40 },
      ]
    : [
        { cls: "top-3 right-1/4 w-44 h-14 bg-white/70 blur-xl", drift: -18, dur: 30 },
      ];
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {extra.map((c, i) => (
        <motion.div
          key={i}
          className={`absolute rounded-full ${c.cls}`}
          animate={{ x: [0, c.drift, 0] }}
          transition={{ duration: c.dur, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

interface WeatherSummary {
  kind: WeatherKind;
  tempC: number;
  code: number;
}

export default function ClockWidget({ className = "" }: { className?: string }) {
  const [now, setNow] = useState<Date | null>(null);
  const [holidayMap, setHolidayMap] = useState<Record<string, HolidayEntry>>({});
  const [weather, setWeather] = useState<WeatherSummary | null>(null);

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

  // 天氣：geolocation → /api/weather，失敗 fallback 台北
  useEffect(() => {
    let cancelled = false;

    const fetchWeather = async (lat: number, lng: number) => {
      try {
        const res = await fetch(`/api/weather?lat=${lat}&lng=${lng}`);
        if (!res.ok) return;
        const raw = await res.json();
        if (cancelled || !raw?.current) return;
        setWeather({
          kind: codeToKind(raw.current.code),
          tempC: Math.round(raw.current.tempC),
          code: raw.current.code,
        });
      } catch {
        // graceful degradation
      }
    };

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => fetchWeather(pos.coords.latitude, pos.coords.longitude),
        () => fetchWeather(25.0330, 121.5654),
        { timeout: 4000, maximumAge: 30 * 60 * 1000 },
      );
    } else {
      fetchWeather(25.0330, 121.5654);
    }

    // 每 15 分鐘更新一次
    const id = setInterval(() => fetchWeather(25.0330, 121.5654), 15 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const data = useMemo(() => {
    if (!now) return null;
    const info = getDayInfo(now.getFullYear(), now.getMonth() + 1, now.getDate());
    const hol = holidayMap[dateKey(now)] ?? null;
    return {
      hour: now.getHours(),
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

  const theme = getSkyTheme(data.hour);

  // 軟邊遮罩：中心實、邊緣淡出到 0。讓所有大氣層在視覺上沒有方框
  const softMask =
    "radial-gradient(ellipse 92% 96% at 50% 50%, #000 40%, rgba(0,0,0,0.6) 70%, rgba(0,0,0,0) 100%)";

  return (
    <div className={`${className} relative flex flex-col justify-center px-6 py-7 min-w-0 h-full`}>
      {/* 大氣統一層：tint + 天體 + 雲 + 天氣特效 一起被軟邊遮罩羽化，徹底消除卡片邊 */}
      <div
        className="absolute inset-0 overflow-hidden pointer-events-none"
        style={{
          WebkitMaskImage: softMask,
          maskImage: softMask,
        }}
        aria-hidden
      >
        {/* 時段天空 tint */}
        <AnimatePresence mode="sync">
          <motion.div
            key={theme.kind}
            className="absolute inset-0"
            style={{ backgroundImage: getRadialTint(theme.kind) }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, ease: "easeInOut" }}
          />
        </AnimatePresence>

        {/* 天體 */}
        <Celestial kind={theme.kind} />

        {/* 雲朵 */}
        {CLOUDS.map((c, i) => (
          <motion.div
            key={i}
            className={`absolute rounded-full ${c.cls}`}
            animate={{ x: [0, c.drift, 0] }}
            transition={{ duration: c.dur, repeat: Infinity, ease: "easeInOut" }}
          />
        ))}

        {/* 天氣條件追加的厚雲 */}
        {weather && <ExtraClouds kind={weather.kind} />}

        {/* 雨 / 雪 / 霧 / 雷電 */}
        {weather && <WeatherFX kind={weather.kind} />}
      </div>

      {/* 內容：左對齊，對齊 greeting 風格 */}
      <motion.div
        className="relative"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15, ease: "easeOut" }}
      >
        <div className="text-[11px] text-on-surface-variant font-medium tracking-wide mb-1 flex items-center gap-2">
          <span>{data.dateStr} · {data.lunarStr}</span>
          <AnimatePresence>
            {weather && (
              <motion.span
                key={weather.kind}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-white/40 text-slate-700 font-semibold text-[10px]"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.3 }}
              >
                {kindLabel(weather.kind)} · {weather.tempC}°
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <div className="relative h-[44px] mb-2 overflow-hidden">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.h1
              key={data.timeStr}
              className="absolute inset-0 text-[44px] font-extrabold font-display text-on-surface tracking-tight leading-none tabular-nums"
              initial={{ y: -10, opacity: 0, filter: "blur(4px)" }}
              animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
              exit={{ y: 10, opacity: 0, filter: "blur(4px)" }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            >
              {data.timeStr}
            </motion.h1>
          </AnimatePresence>
        </div>

        {data.hol?.description && data.hol.isHoliday && (
          <div className="inline-block mb-2 px-2 py-0.5 bg-rose-50/90 text-rose-700 rounded text-[10px] font-bold">
            今日：{data.hol.description}
          </div>
        )}
        {data.hol?.isWorkday && (
          <div className="inline-block mb-2 px-2 py-0.5 bg-orange-50/90 text-orange-700 rounded text-[10px] font-bold">
            今日：補班日{data.hol.description ? `（${data.hol.description}）` : ""}
          </div>
        )}

        <div className="text-xs text-on-surface-variant space-y-0.5">
          <div>
            <span className="font-bold text-emerald-700">宜</span>{" "}
            {data.yi.length ? data.yi.join("・") : "—"}
          </div>
          <div>
            <span className="font-bold text-rose-700">忌</span>{" "}
            {data.ji.length ? data.ji.join("・") : "—"}
          </div>
          <div className="flex justify-end">
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full tracking-wider ${
                data.isGood ? "bg-emerald-50/80 text-emerald-700" : "bg-slate-100/80 text-slate-600"
              }`}
            >
              {data.tianShen}日
            </span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
