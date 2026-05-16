"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/**
 * <ModuleHomeGallery> — 共用「模組首頁圖卡導覽」元件。
 *
 * 對應設計稿：DUCATI_v2_output/01_銷售接待/00_模組導覽/CRM00_客服管理模組_導覽總覽_v2.html
 *
 * 用途：每個業務大模組（CRM / Sales / Service / Parts）的入口頁面，
 * 統一格式：Hero banner + KPI row + 多個 Panel（每 panel 含分節 layer + 圖卡 grid）。
 *
 * 範例 caller：src/app/(workspace)/crm/page.tsx
 * 後續 reuse：/sales、/service、/parts 的 root page 都餵自己的 hero/kpis/panels。
 */

// ---------- types ----------

export type ModuleHomeStat = { value: string | number; label: string };

export type ModuleHomeKpiTone = "blue" | "teal" | "amber" | "purple" | "navy";

export type ModuleHomeKpi = {
  label: string;
  value: string | number;
  sub?: string;
  tone?: ModuleHomeKpiTone;
};

export type ModuleHomeCardTone = "blue" | "teal" | "navy";

export type ModuleHomeBadgeTone = "red" | "navy" | "green";

export type ModuleHomeCardBadge = {
  text: string;
  tone?: ModuleHomeBadgeTone;
};

export type ModuleHomeCard = {
  code: string;
  name: string;
  desc: string;
  href: string;
  tone?: ModuleHomeCardTone;
  badge?: ModuleHomeCardBadge;
};

export type ModuleHomeLayer = {
  title: string;
  cards: ModuleHomeCard[];
};

export type ModuleHomePanelTone = "blue" | "teal" | "navy";

export type ModuleHomePanel = {
  icon: string;          // material-symbols 圖示名（不帶字體前綴）
  title: string;
  subtitle?: string;
  tone?: ModuleHomePanelTone;
  badge?: { text: string; tone?: "red" | "green" };
  layers: ModuleHomeLayer[];
  note?: ReactNode;      // panel body 頂端可選 callout（例：「RS05 串接：...」）
};

export type ModuleHomeGalleryProps = {
  hero: {
    title: string;
    description: string;
    stats?: ModuleHomeStat[];
  };
  kpis?: ModuleHomeKpi[];
  panels: ModuleHomePanel[];
};

// ---------- visual tokens ----------

const KPI_VALUE_COLOR: Record<ModuleHomeKpiTone, string> = {
  blue: "text-[#185FA5]",
  teal: "text-[#0F6E56]",
  amber: "text-[#D4820A]",
  purple: "text-[#534AB7]",
  navy: "text-[#1A3A5C]",
};

const CARD_TONE: Record<ModuleHomeCardTone, string> = {
  blue: "bg-[#EAF4FB] border-[#85B7EB]",
  teal: "bg-[#E1F5EE] border-[#5DCAA5]",
  navy: "bg-[#E8EDF2] border-[#8FAABB]",
};

const PANEL_HEADER_BG: Record<ModuleHomePanelTone, string> = {
  blue: "bg-[#FAFAF8] text-[#2C2C2A]",
  teal: "bg-gradient-to-r from-[#0C5A46] to-[#0F6E56] text-white",
  navy: "bg-gradient-to-r from-[#0D2438] to-[#1A3A5C] text-white",
};

const PANEL_ICON_BG: Record<ModuleHomePanelTone, string> = {
  blue: "bg-[#EAF4FB] text-[#185FA5]",
  teal: "bg-white/15 text-white",
  navy: "bg-white/15 text-white",
};

const PANEL_BORDER: Record<ModuleHomePanelTone, string> = {
  blue: "border-[#EEECE6]",
  teal: "border-[#5DCAA5]",
  navy: "border-[#8FAABB]",
};

const LAYER_TITLE_COLOR: Record<ModuleHomePanelTone, string> = {
  blue: "text-[#9A9890]",
  teal: "text-[#0F6E56]",
  navy: "text-[#9A9890]",
};

const BADGE_TONE: Record<NonNullable<ModuleHomeCardBadge["tone"]>, string> = {
  red: "bg-[#C8001A] text-white",
  navy: "bg-white/70 text-[#2C2C2A]",
  green: "bg-[#EAF3DE] text-[#3B6D11]",
};

// ---------- component ----------

export function ModuleHomeGallery({ hero, kpis, panels }: ModuleHomeGalleryProps) {
  return (
    <div className="px-6 py-5 space-y-4">
      {/* Hero */}
      <section
        className="rounded-xl px-7 py-6 text-white flex flex-wrap items-center justify-between gap-4 relative overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, #0D2B47 0%, #1A3A5C 45%, #0C4A3A 100%)",
        }}
      >
        <div className="max-w-[680px]">
          <h1 className="text-[20px] font-bold mb-1.5 leading-tight">{hero.title}</h1>
          <p className="text-[12.5px] opacity-80 leading-[1.75]">{hero.description}</p>
        </div>
        {hero.stats && hero.stats.length > 0 && (
          <div className="flex flex-wrap gap-2.5">
            {hero.stats.map((s) => (
              <div
                key={s.label}
                className="text-center bg-white/10 border border-white/15 rounded-lg px-4 py-2"
              >
                <div className="text-[22px] font-bold font-mono leading-none">{s.value}</div>
                <div className="text-[10px] opacity-65 mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* KPI row */}
      {kpis && kpis.length > 0 && (
        <section className="grid gap-2.5 grid-cols-2 md:grid-cols-4">
          {kpis.map((k) => (
            <div
              key={k.label}
              className="bg-white border border-[#EEECE6] rounded-lg px-3.5 py-3"
            >
              <div className="text-[10.5px] text-[#9A9890] mb-1">{k.label}</div>
              <div
                className={`text-[22px] font-bold font-mono leading-none mb-0.5 ${
                  KPI_VALUE_COLOR[k.tone ?? "navy"]
                }`}
              >
                {k.value}
              </div>
              {k.sub && <div className="text-[10.5px] text-[#9A9890]">{k.sub}</div>}
            </div>
          ))}
        </section>
      )}

      {/* Panels */}
      <div className="space-y-3.5">
        {panels.map((panel, idx) => {
          const tone = panel.tone ?? "blue";
          return (
            <section
              key={`${panel.title}-${idx}`}
              className={`bg-white border rounded-[10px] overflow-hidden ${PANEL_BORDER[tone]}`}
            >
              {/* Panel header */}
              <header
                className={`px-4 py-3 flex items-center gap-2.5 border-b border-[#EEECE6] ${PANEL_HEADER_BG[tone]}`}
              >
                <div
                  className={`w-[30px] h-[30px] rounded-md flex items-center justify-center shrink-0 ${PANEL_ICON_BG[tone]}`}
                >
                  <span className="material-symbols-outlined text-[16px]">
                    {panel.icon}
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold">{panel.title}</div>
                  {panel.subtitle && (
                    <div
                      className={`text-[11px] mt-0.5 ${
                        tone === "blue" ? "text-[#9A9890]" : "text-white/70"
                      }`}
                    >
                      {panel.subtitle}
                    </div>
                  )}
                </div>
                {panel.badge && (
                  <span
                    className={`ml-auto px-2.5 py-0.5 rounded-md text-[10.5px] font-bold whitespace-nowrap ${
                      panel.badge.tone === "red"
                        ? "bg-[#C8001A]/70 text-white"
                        : panel.badge.tone === "green"
                          ? "bg-white/20 text-white"
                          : "bg-white/20 text-white"
                    }`}
                  >
                    {panel.badge.text}
                  </span>
                )}
              </header>

              {/* Panel body */}
              <div className="px-4 py-3.5 space-y-3">
                {panel.note && <div>{panel.note}</div>}
                {panel.layers.map((layer, lIdx) => (
                  <div key={`${layer.title}-${lIdx}`}>
                    <div
                      className={`text-[10.5px] font-semibold tracking-wider uppercase mb-2 flex items-center gap-2 ${LAYER_TITLE_COLOR[tone]}`}
                    >
                      <span>{layer.title}</span>
                      <span className="flex-1 h-px bg-[#EEECE6]" />
                    </div>
                    <div className="grid gap-2.5 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                      {layer.cards.map((card) => {
                        const resolvedTone: ModuleHomeCardTone =
                          card.tone ?? (tone === "navy" ? "navy" : tone === "teal" ? "teal" : "blue");
                        return (
                          <Link
                            key={card.code}
                            href={card.href}
                            className={`relative block rounded-[9px] px-3.5 py-3 border-[1.5px] transition-all hover:-translate-y-[1px] hover:shadow-[0_3px_12px_rgba(0,0,0,0.1)] ${CARD_TONE[resolvedTone]}`}
                          >
                            {card.badge && (
                              <span
                                className={`absolute top-2.5 right-2.5 px-1.5 py-0.5 rounded text-[9.5px] font-bold font-mono ${
                                  BADGE_TONE[card.badge.tone ?? "navy"]
                                }`}
                              >
                                {card.badge.text}
                              </span>
                            )}
                            <div className="text-[10px] font-mono font-semibold opacity-70 mb-1">
                              {card.code}
                            </div>
                            <div className="text-[13px] font-bold leading-tight mb-1 text-[#2C2C2A]">
                              {card.name}
                            </div>
                            <div className="text-[11px] leading-[1.5] opacity-75 text-[#2C2C2A]">
                              {card.desc}
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
