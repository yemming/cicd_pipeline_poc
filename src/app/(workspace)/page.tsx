"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { modules } from "@/lib/modules";
import { useSetPageHeader } from "@/components/page-header-context";
import { useProfile, getGreeting } from "@/lib/use-profile";

const ClockWidget = dynamic(() => import("@/components/clock-widget"), {
  ssr: false,
});

export default function LauncherPage() {
  useSetPageHeader({ hideSearch: false });
  const profile = useProfile();

  return (
    <div className="max-w-6xl mx-auto pt-4">
      {/* ─────── Editorial masthead ─────── */}
      <section className="mb-10">
        {/* Top strip：經銷商招牌 × 金色分隔線 × Dashboard 小標 */}
        <div className="flex items-center gap-4 mb-4 px-1">
          <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-[#CC0000] shrink-0">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: "#CC0000" }}
            />
            Ducati Taipei · Official Dealer
          </div>
          <div className="h-px bg-gradient-to-r from-[#C9A84C]/70 via-[#C9A84C]/30 to-transparent flex-1" />
          <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400 shrink-0">
            Dashboard
          </div>
        </div>

        {/* 三等分主結構 */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.15fr)] gap-4 items-stretch">
          {/* 1. Greeting 卡 */}
          <div className="relative bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-7 flex flex-col justify-center overflow-hidden">
            <span
              className="absolute left-0 top-6 bottom-6 w-[3px] rounded-r"
              style={{ backgroundColor: "#C9A84C" }}
            />
            <h1 className="text-[26px] font-extrabold font-display text-on-surface tracking-tight leading-tight mb-2 whitespace-nowrap">
              {getGreeting()}，{profile?.name ?? "..."}
            </h1>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              選擇一個應用開始你的一天
              <span className="mx-1.5 text-slate-300">·</span>
              或用{" "}
              <kbd className="px-1 py-0.5 rounded border border-slate-300 text-[10px] font-medium bg-white">
                ⌘K
              </kbd>{" "}
              直接搜尋
            </p>
          </div>

          {/* 2. 老黃曆 + Clock */}
          <ClockWidget />

          {/* 3. Stats 卡（內含 6 格） */}
          <div className="relative bg-white rounded-2xl border border-slate-100 shadow-sm p-2 grid grid-cols-3 grid-rows-2 gap-1.5">
            <StatCell label="今日接待" value="14" accent="#CC0000" icon="support_agent" />
            <StatCell label="試駕預約" value="5"  accent="#4A90E2" icon="two_wheeler" />
            <StatCell label="待報價"   value="7"  accent="#8B5CF6" icon="request_quote" />
            <StatCell label="進行訂單" value="8"  accent="#1A1A2E" icon="assignment" />
            <StatCell label="待交車"   value="3"  accent="#C9A84C" icon="celebration" />
            <StatCell label="庫存車"   value="42" accent="#0891B2" icon="inventory_2" />
          </div>
        </div>
      </section>

      {/* Module grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {modules.map((m) => {
          const card = (
            <div
              className={`relative bg-white rounded-2xl p-6 shadow-sm border border-slate-100 h-full transition-all ${
                m.comingSoon
                  ? "opacity-60 cursor-not-allowed"
                  : "hover:shadow-lg hover:-translate-y-1 cursor-pointer hover:border-slate-200"
              }`}
            >
              {m.comingSoon && (
                <div className="absolute top-4 right-4 text-[10px] font-bold text-[#CC0000] bg-[#CC0000]/10 px-2 py-1 rounded-full">
                  即將推出
                </div>
              )}

              <div className="flex items-center gap-4 mb-4">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{
                    backgroundColor: m.accent ? `${m.accent}22` : "#CC000022",
                  }}
                >
                  <span
                    className="material-symbols-outlined text-2xl"
                    style={{ color: m.accent ?? "#CC0000" }}
                  >
                    {m.icon}
                  </span>
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-on-surface text-lg font-display tracking-tight truncate">
                    {m.name}
                  </h3>
                  {m.description && (
                    <p className="text-xs text-on-surface-variant truncate">
                      {m.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {m.pages.slice(0, 4).map((p) => (
                  <span
                    key={p.href}
                    className="text-[11px] px-2 py-0.5 bg-surface-container-low rounded-md text-on-surface-variant"
                  >
                    {p.name}
                  </span>
                ))}
                {m.pages.length > 4 && (
                  <span className="text-[11px] px-2 py-0.5 text-on-surface-variant">
                    +{m.pages.length - 4}
                  </span>
                )}
              </div>

              {/* accent ribbon */}
              {!m.comingSoon && (
                <div
                  className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ backgroundColor: m.accent ?? "#CC0000" }}
                />
              )}
            </div>
          );

          if (m.comingSoon) {
            return (
              <div key={m.key} aria-disabled="true">
                {card}
              </div>
            );
          }
          return (
            <Link key={m.key} href={m.home} className="group">
              {card}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function StatCell({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: string;
  accent: string;
  icon: string;
}) {
  return (
    <div className="rounded-xl px-2 py-2 flex flex-col items-center justify-center gap-1 hover:bg-slate-50/60 transition min-w-0">
      <div className="inline-flex items-center gap-2">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${accent}15`, color: accent }}
        >
          <span className="material-symbols-outlined text-lg">{icon}</span>
        </div>
        <div
          className="text-2xl font-extrabold font-display leading-none tabular-nums"
          style={{ color: accent }}
        >
          {value}
        </div>
      </div>
      <div className="text-[11px] text-slate-500 font-semibold tracking-wide whitespace-nowrap">
        {label}
      </div>
    </div>
  );
}
