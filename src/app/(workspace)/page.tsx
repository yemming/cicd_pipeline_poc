"use client";

import Link from "next/link";
import { modules } from "@/lib/modules";
import { useSetPageHeader } from "@/components/page-header-context";
import { useProfile, getGreeting } from "@/lib/use-profile";

export default function LauncherPage() {
  useSetPageHeader({ title: "DealerOS Workspace", hideSearch: false });
  const profile = useProfile();

  return (
    <div className="max-w-6xl mx-auto pt-4">
      {/* Hero */}
      <div className="mb-10 flex items-start justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#CC0000] mb-3">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: "#CC0000" }}
            />
            Ducati Taipei · Official Dealer
          </div>
          <h1 className="text-4xl font-extrabold font-display text-on-surface tracking-tight mb-2">
            {getGreeting()}，{profile?.name ?? "..."}
          </h1>
          <p className="text-on-surface-variant">
            選擇一個應用開始你的一天，或用{" "}
            <kbd className="px-1.5 py-0.5 rounded border border-slate-300 text-[11px] font-medium bg-white">
              ⌘K
            </kbd>{" "}
            直接搜尋。
          </p>
        </div>

        {/* Quick stats */}
        <div className="hidden md:flex items-stretch gap-3">
          <StatChip label="今日接待" value="14" accent="#CC0000" icon="support_agent" />
          <StatChip label="進行訂單" value="8" accent="#1A1A2E" icon="assignment" />
          <StatChip label="待交車" value="3" accent="#C9A84C" icon="celebration" />
        </div>
      </div>

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

function StatChip({
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
    <div className="flex items-center gap-3 bg-white rounded-xl border border-slate-100 px-4 py-3 shadow-sm">
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center"
        style={{ backgroundColor: `${accent}15`, color: accent }}
      >
        <span className="material-symbols-outlined text-lg">{icon}</span>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
          {label}
        </div>
        <div
          className="text-xl font-extrabold font-display leading-tight"
          style={{ color: accent }}
        >
          {value}
        </div>
      </div>
    </div>
  );
}
