"use client";

import { useState, ReactNode } from "react";

export type TabDef = {
  key: string;
  number: string;
  name: string;
  hint?: string;
  /** 主色：tab 底線 / 標籤膠囊 / 內容區 section header */
  tone: "red" | "orange" | "amber" | "green" | "teal" | "blue" | "violet";
  render: () => ReactNode;
};

const TONE_PILL: Record<TabDef["tone"], string> = {
  red: "bg-red-700 text-white",
  orange: "bg-orange-600 text-white",
  amber: "bg-amber-600 text-white",
  green: "bg-emerald-600 text-white",
  teal: "bg-teal-600 text-white",
  blue: "bg-blue-700 text-white",
  violet: "bg-violet-700 text-white",
};

const TONE_RING: Record<TabDef["tone"], string> = {
  red: "ring-red-500/40",
  orange: "ring-orange-500/40",
  amber: "ring-amber-500/40",
  green: "ring-emerald-500/40",
  teal: "ring-teal-500/40",
  blue: "ring-blue-500/40",
  violet: "ring-violet-500/40",
};

const TONE_TEXT: Record<TabDef["tone"], string> = {
  red: "text-red-700",
  orange: "text-orange-700",
  amber: "text-amber-700",
  green: "text-emerald-700",
  teal: "text-teal-700",
  blue: "text-blue-700",
  violet: "text-violet-700",
};

export function TabsShell({ tabs }: { tabs: TabDef[] }) {
  const [active, setActive] = useState(tabs[0]?.key);
  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <div className="space-y-4">
      {/* Tab strip */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-2 py-2 overflow-x-auto">
        <div className="flex gap-1.5 min-w-fit">
          {tabs.map((t) => {
            const isActive = t.key === active;
            return (
              <button
                key={t.key}
                onClick={() => setActive(t.key)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all whitespace-nowrap ${
                  isActive
                    ? `${TONE_PILL[t.tone]} shadow-md ring-2 ${TONE_RING[t.tone]}`
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <span
                  className={`inline-flex items-center justify-center w-6 h-6 rounded-full font-bold text-xs font-mono ${
                    isActive
                      ? "bg-white/20 text-white"
                      : `bg-slate-100 ${TONE_TEXT[t.tone]}`
                  }`}
                >
                  {t.number}
                </span>
                <div className="text-left leading-tight">
                  <div className="text-[12.5px] font-bold tracking-tight">{t.name}</div>
                  {t.hint && (
                    <div
                      className={`text-[10px] ${
                        isActive ? "text-white/70" : "text-slate-400"
                      }`}
                    >
                      {t.hint}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active tab content */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 md:p-6">
        {current?.render()}
      </div>
    </div>
  );
}
