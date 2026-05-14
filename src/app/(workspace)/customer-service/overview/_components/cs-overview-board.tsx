"use client";

import { useState } from "react";
import { useSetPageHeader } from "@/components/page-header-context";
import type {
  CsModuleAccent,
  CsModuleCard,
  CsModulePanel,
  CsModuleLayer,
  CsModuleConnectionStatus,
  CsModuleFileVersionTone,
} from "@/domain/customer-service-overview.constants";
import type { CustomerServiceOverviewData } from "@/domain/customer-service-overview";

// 模組卡片 accent 色票
const CARD_ACCENT: Record<CsModuleAccent, { bg: string; border: string }> = {
  blue:   { bg: "#EAF4FB", border: "#85B7EB" },
  teal:   { bg: "#E1F5EE", border: "#5DCAA5" },
  red:    { bg: "#FDECEA", border: "#F5AEAD" },
  amber:  { bg: "#FDF3E3", border: "#F0C97E" },
  purple: { bg: "#EEEDFE", border: "#AFA9EC" },
  dark:   { bg: "#E8EDF2", border: "#8FAABB" },
  green:  { bg: "#EAF3DE", border: "#B5D4B0" },
};

const PANEL_ICON_BG: Record<CsModuleAccent, string> = {
  blue:   "#EAF4FB",
  teal:   "#E1F5EE",
  red:    "#FDECEA",
  amber:  "#FDF3E3",
  purple: "#EEEDFE",
  dark:   "#E8EDF2",
  green:  "#EAF3DE",
};

const CONN_STATUS_STYLE: Record<
  CsModuleConnectionStatus,
  { bg: string; color: string; label: string }
> = {
  live: { bg: "#E1F5EE", color: "#0F6E56", label: "設計已對應" },
  sim:  { bg: "#FDF3E3", color: "#854F0B", label: "Phase 2 真實串接" },
  p2:   { bg: "#F1EFE8", color: "#5A5955", label: "Phase 2" },
};

const FILE_BADGE_STYLE: Record<
  CsModuleFileVersionTone,
  { bg: string; color: string }
> = {
  v1:  { bg: "#EAF4FB", color: "#185FA5" },
  v2:  { bg: "#FDECEA", color: "#C8001A" },
  new: { bg: "#E1F5EE", color: "#0F6E56" },
};

// 串接表 row 底色（依 group 區分 A/B/共用）
const CONN_ROW_BG: Record<NonNullable<CsModuleCard["accent"]> | "blue" | "teal" | "none", string> = {
  blue:   "#EAF4FB",
  teal:   "#E1F5EE",
  red:    "#FFFFFF",
  amber:  "#FFFFFF",
  purple: "#FFFFFF",
  dark:   "#FFFFFF",
  green:  "#FFFFFF",
  none:   "#FFFFFF",
};

// 檔案表 group 分隔列樣式
const FILE_GROUP_HEADER: Record<"none" | "blue" | "teal", { bg: string; color: string; label: string }> = {
  none: { bg: "#F4F3F0", color: "#5A5955", label: "── 共用 ──" },
  blue: { bg: "#EAF4FB", color: "#185FA5", label: "── 銷售側 A 系列 ──" },
  teal: { bg: "#E1F5EE", color: "#0F6E56", label: "── 售後側 B 系列 · 全新建立 ──" },
};

const TABS = [
  { key: "modules",     label: "📋 模組總覽" },
  { key: "connections", label: "🔗 串接關係" },
  { key: "files",       label: "📁 檔案清單" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function CsOverviewBoard({ data }: { data: CustomerServiceOverviewData }) {
  useSetPageHeader({
    title: "客服功能導覽",
    breadcrumb: [{ label: "客服管理" }, { label: "客服功能導覽" }],
    hideSearch: true,
  });

  const [tab, setTab] = useState<TabKey>("modules");
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    window.clearTimeout((window as unknown as { __csToast?: number }).__csToast);
    (window as unknown as { __csToast?: number }).__csToast = window.setTimeout(
      () => setToast(null),
      2500,
    ) as unknown as number;
  };

  // 分組檔案（共用 → 銷售側 → 售後側）
  const filesByGroup: Array<{ group: "none" | "blue" | "teal"; rows: CustomerServiceOverviewData["files"] }> = [
    { group: "none", rows: data.files.filter((f) => (f.group ?? "none") === "none") },
    { group: "blue", rows: data.files.filter((f) => f.group === "blue") },
    { group: "teal", rows: data.files.filter((f) => f.group === "teal") },
  ];

  return (
    <main className="px-6 py-5 space-y-4" data-testid="cs-overview-page">
      {/* Hero */}
      <div
        className="rounded-xl p-7 text-white flex items-center justify-between flex-wrap gap-4 relative overflow-hidden"
        style={{ background: "linear-gradient(135deg,#0D2B47 0%,#1A3A5C 45%,#8B0010 100%)" }}
      >
        <div className="relative z-10 max-w-[640px]">
          <h1 className="text-[20px] font-bold mb-1.5 tracking-wide">🎧 {data.hero.title}</h1>
          <p className="text-[12.5px] leading-[1.75] opacity-80">{data.hero.description}</p>
        </div>
        <div className="flex gap-2.5 flex-wrap relative z-10">
          {data.hero.stats.map((s) => (
            <div
              key={s.label}
              className="text-center rounded-lg px-5 py-2.5"
              style={{ background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.15)" }}
            >
              <div className="text-[22px] font-bold leading-none">{s.value}</div>
              <div className="text-[10px] opacity-65 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
        <div
          className="absolute pointer-events-none"
          style={{
            right: -30, top: -30, width: 200, height: 200,
            borderRadius: "50%", background: "rgba(200,0,26,.15)",
          }}
        />
      </div>

      {/* KPI 四格 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {data.kpis.map((k) => (
          <div
            key={k.label}
            className="bg-white border border-[#EEECE6] rounded-lg px-3.5 py-3"
            data-testid="cs-overview-kpi"
          >
            <div className="text-[10.5px] text-[#9A9890] mb-1">{k.label}</div>
            <div
              className="text-[22px] font-bold font-mono leading-none mb-0.5"
              style={{
                color:
                  k.tone === "blue"   ? "#185FA5" :
                  k.tone === "teal"   ? "#0F6E56" :
                  k.tone === "amber"  ? "#854F0B" :
                  k.tone === "purple" ? "#534AB7" :
                                        "#C8001A",
              }}
            >
              {k.value}
            </div>
            <div className="text-[10.5px] text-[#9A9890]">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Tab bar */}
      <div className="flex gap-0 border-b-2 border-[#EEECE6]">
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="px-5 py-2.5 text-[13px] font-medium whitespace-nowrap -mb-[2px] border-b-2 transition-colors"
              style={{
                color: active ? "#1A3A5C" : "#7A7A78",
                borderBottomColor: active ? "#1A3A5C" : "transparent",
                fontWeight: active ? 700 : 500,
              }}
              data-testid={`cs-overview-tab-${t.key}`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {tab === "modules" && (
        <div className="space-y-3.5">
          {data.panels.map((p) => (
            <PanelBlock key={p.key} panel={p} onCardClick={(c) => showToast(`→ ${c.fileName}`)} />
          ))}
        </div>
      )}

      {tab === "connections" && (
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <PanelHeader
            icon="🔗"
            iconBg="#FDECEA"
            title="跨模組串接關係明細"
            subtitle="CRM ↔ RS 銷售 / SA 售後 · 共 13 個設計串接點"
          />
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["來源", "", "目標", "說明", "狀態"].map((h, i) => (
                    <th
                      key={i}
                      className="text-[10.5px] font-semibold tracking-wider uppercase text-[#9A9890] px-3 py-2 border-b-2 border-[#EEECE6] text-left whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.connections.map((c, i) => {
                  const sty = CONN_STATUS_STYLE[c.status];
                  const rowBg = CONN_ROW_BG[c.group ?? "none"];
                  const groupColor =
                    c.group === "teal" ? "#0F6E56" :
                    c.group === "blue" ? "#1A3A5C" :
                                          "#1A3A5C";
                  return (
                    <tr key={i} style={{ background: rowBg }} className="hover:brightness-95">
                      <td
                        className="px-3 py-2.5 border-b border-[#F4F3F0] text-[11.5px] font-semibold font-mono align-top"
                        style={{ color: groupColor }}
                      >
                        {c.from}
                      </td>
                      <td className="px-1.5 py-2.5 border-b border-[#F4F3F0] text-[14px] font-bold text-[#C8001A]">→</td>
                      <td
                        className="px-3 py-2.5 border-b border-[#F4F3F0] text-[11.5px] font-mono align-top"
                        style={{ color: groupColor }}
                      >
                        {c.to}
                      </td>
                      <td className="px-3 py-2.5 border-b border-[#F4F3F0] text-[11.5px] text-[#5A5955] align-top">
                        {c.description}
                      </td>
                      <td className="px-3 py-2.5 border-b border-[#F4F3F0] align-top">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded text-[10.5px] whitespace-nowrap"
                          style={{ background: sty.bg, color: sty.color }}
                        >
                          {sty.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "files" && (
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <PanelHeader
            icon="📁"
            iconBg="#E1F5EE"
            title="CRM 全系列完整檔案清單"
            subtitle="v2 現行版本 · 15 個模組 · 去重後最終版"
          />
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["代碼", "最終檔名", "版本", "狀態", "說明"].map((h) => (
                    <th
                      key={h}
                      className="text-[10.5px] font-semibold tracking-wider uppercase text-[#9A9890] px-3 py-2 border-b-2 border-[#EEECE6] text-left whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filesByGroup.map((bucket) =>
                  bucket.rows.length === 0 ? null : (
                    <FileGroupRows
                      key={bucket.group}
                      group={bucket.group}
                      rows={bucket.rows}
                    />
                  ),
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 right-6 px-4 py-2.5 rounded-lg text-[12.5px] text-white shadow-lg z-50"
          style={{ background: "#1A3A5C" }}
          data-testid="cs-overview-toast"
        >
          {toast}
        </div>
      )}
    </main>
  );
}

// ─── 子元件 ─────────────────────────────────────────────

function FileGroupRows({
  group,
  rows,
}: {
  group: "none" | "blue" | "teal";
  rows: CustomerServiceOverviewData["files"];
}) {
  const hdr = FILE_GROUP_HEADER[group];
  return (
    <>
      <tr style={{ background: hdr.bg }}>
        <td
          colSpan={5}
          className="px-3 py-1.5 text-[10.5px] font-bold tracking-wider"
          style={{ color: hdr.color, letterSpacing: ".4px" }}
        >
          {hdr.label}
        </td>
      </tr>
      {rows.map((f) => {
        const sty = FILE_BADGE_STYLE[f.versionTone];
        const codeColor =
          group === "teal" ? "#0F6E56" :
          group === "blue" ? "#185FA5" :
                              "#1A3A5C";
        return (
          <tr key={f.code} className="hover:bg-[#FAFAF8]">
            <td
              className="px-3 py-2.5 border-b border-[#F4F3F0] text-[11.5px] font-semibold font-mono"
              style={{ color: codeColor }}
            >
              {f.code}
            </td>
            <td className="px-3 py-2.5 border-b border-[#F4F3F0] text-[12px] text-[#2C2C2A]">
              {f.fileName}
            </td>
            <td className="px-3 py-2.5 border-b border-[#F4F3F0]">
              <span
                className="inline-flex items-center px-2 py-0.5 rounded text-[10.5px] font-semibold whitespace-nowrap"
                style={{ background: sty.bg, color: sty.color }}
              >
                {f.version}
              </span>
            </td>
            <td className="px-3 py-2.5 border-b border-[#F4F3F0]">
              <span
                className="inline-flex items-center px-2 py-0.5 rounded text-[10.5px] font-semibold whitespace-nowrap"
                style={{ background: "#EAF3DE", color: "#3B6D11" }}
              >
                {f.status}
              </span>
            </td>
            <td className="px-3 py-2.5 border-b border-[#F4F3F0] text-[12px] text-[#5A5955]">
              {f.description}
            </td>
          </tr>
        );
      })}
    </>
  );
}

function PanelHeader({
  icon, iconBg, title, subtitle, emphasis, doneBadge,
}: {
  icon: string;
  iconBg: string;
  title: string;
  subtitle: string;
  emphasis?: "teal" | "navy";
  doneBadge?: string;
}) {
  const headerStyle: React.CSSProperties =
    emphasis === "teal"
      ? { background: "linear-gradient(90deg,#0C5A46,#0F6E56)", color: "#fff" }
      : emphasis === "navy"
      ? { background: "linear-gradient(90deg,#0D2438,#1A3A5C)", color: "#fff" }
      : { background: "#FAFAF8" };

  const titleColor = emphasis ? "#fff" : "#2C2C2A";
  const subColor = emphasis ? "rgba(255,255,255,.7)" : "#9A9890";
  const badgeStyle: React.CSSProperties = emphasis
    ? { background: "rgba(255,255,255,.2)", color: "#fff" }
    : { background: "#FDECEA", color: "#C8001A" };

  return (
    <header
      className="px-4 py-2.5 flex items-center gap-2.5 border-b border-[#EEECE6]"
      style={headerStyle}
    >
      <div
        className="text-[15px] w-[30px] h-[30px] rounded-md flex items-center justify-center flex-shrink-0"
        style={{ background: emphasis ? "rgba(255,255,255,.15)" : iconBg }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold" style={{ color: titleColor }}>
          {title}
        </div>
        <div className="text-[11px] mt-0.5" style={{ color: subColor }}>
          {subtitle}
        </div>
      </div>
      {doneBadge && (
        <span
          className="inline-flex items-center px-2.5 py-1 rounded text-[10.5px] font-bold whitespace-nowrap"
          style={badgeStyle}
        >
          {doneBadge}
        </span>
      )}
    </header>
  );
}

function PanelBlock({
  panel,
  onCardClick,
}: {
  panel: CsModulePanel;
  onCardClick: (c: CsModuleCard) => void;
}) {
  const gridCols = panel.gridCols === 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-2 md:grid-cols-3";
  const borderColor =
    panel.emphasis === "teal" ? "#5DCAA5" :
    panel.emphasis === "navy" ? "#8FAABB" : "#EEECE6";
  const layerColor = panel.emphasis === "teal" ? "#0F6E56" : "#2C2C2A";

  return (
    <section
      className="bg-white border rounded-lg overflow-hidden"
      style={{ borderColor }}
    >
      <PanelHeader
        icon={panel.icon}
        iconBg={PANEL_ICON_BG[panel.accent]}
        title={panel.title}
        subtitle={panel.subtitle}
        emphasis={panel.emphasis === "default" ? undefined : panel.emphasis}
        doneBadge={panel.doneBadge}
      />
      <div className="px-4 py-3.5">
        {panel.note && (
          <div
            className="border rounded-md px-3.5 py-2.5 mb-3 text-[12px] leading-snug"
            style={{ background: "#E1F5EE", borderColor: "#A8DFC9", color: "#0F6E56" }}
          >
            {panel.note}
          </div>
        )}
        {panel.layers.map((layer, idx) => (
          <LayerBlock
            key={`${panel.key}-layer-${idx}`}
            panelKey={panel.key}
            layer={layer}
            gridCols={gridCols}
            layerColor={layerColor}
            isLast={idx === panel.layers.length - 1}
            onCardClick={onCardClick}
          />
        ))}
      </div>
    </section>
  );
}

function LayerBlock({
  panelKey,
  layer,
  gridCols,
  layerColor,
  isLast,
  onCardClick,
}: {
  panelKey: string;
  layer: CsModuleLayer;
  gridCols: string;
  layerColor: string;
  isLast: boolean;
  onCardClick: (c: CsModuleCard) => void;
}) {
  return (
    <div className={isLast ? "" : "mb-3"}>
      {layer.title && (
        <div
          className="text-[11px] font-semibold tracking-wider uppercase mb-2"
          style={{ color: layerColor, opacity: 0.85 }}
        >
          {layer.title}
        </div>
      )}
      <div className={`grid ${gridCols} gap-2.5`}>
        {layer.cards.map((card) => (
          <ModuleCard
            key={`${panelKey}-${card.code}`}
            card={card}
            onClick={() => onCardClick(card)}
          />
        ))}
      </div>
    </div>
  );
}

function ModuleCard({ card, onClick }: { card: CsModuleCard; onClick: () => void }) {
  const accent = CARD_ACCENT[card.accent];
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-lg p-3.5 transition-all hover:-translate-y-0.5 hover:shadow-md relative"
      style={{
        background: accent.bg,
        border: `1.5px solid ${accent.border}`,
      }}
      data-testid={`cs-overview-card-${card.code}`}
    >
      {card.versionTone === "new" || card.versionTone === "upd" ? (
        <span
          className="absolute top-2.5 right-2.5 text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wider"
          style={{ background: "#C8001A", color: "#fff" }}
        >
          {card.version}
        </span>
      ) : (
        <span
          className="absolute top-2.5 right-2.5 text-[9.5px] font-mono font-bold px-1.5 py-0.5 rounded"
          style={{ background: "rgba(255,255,255,.6)", color: "#2C2C2A" }}
        >
          {card.version}
        </span>
      )}
      <div className="text-[10px] font-mono font-semibold opacity-70 mb-1.5">{card.code}</div>
      <div className="text-[13px] font-bold mb-1 leading-[1.3] pr-16">{card.name}</div>
      <div className="text-[11px] leading-[1.5] opacity-75">{card.description}</div>
      <div
        className="inline-block text-[9.5px] font-mono px-1.5 py-0.5 rounded mt-2"
        style={{ background: "rgba(255,255,255,.5)" }}
      >
        {card.fileName}
      </div>
    </button>
  );
}
