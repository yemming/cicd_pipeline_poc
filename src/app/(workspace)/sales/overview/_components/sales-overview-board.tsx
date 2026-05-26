"use client";

import { useState } from "react";
import { useSetPageHeader } from "@/components/page-header-context";
import type {
  SalesModuleAccent,
  SalesModuleCard,
  SalesModulePanel,
  SalesModuleConnectionStatus,
  SalesModuleFileVersionTone,
} from "@/domain/sales-overview.constants";
import type { SalesOverviewData } from "@/domain/sales-overview";

// 模組卡片 accent 色票
const CARD_ACCENT: Record<SalesModuleAccent, { bg: string; border: string }> = {
  blue:   { bg: "#EAF4FB", border: "#85B7EB" },
  teal:   { bg: "#E1F5EE", border: "#5DCAA5" },
  red:    { bg: "#FDECEA", border: "#F5AEAD" },
  amber:  { bg: "#FDF3E3", border: "#F0C97E" },
  purple: { bg: "#EEEDFE", border: "#AFA9EC" },
  dark:   { bg: "#E8EDF2", border: "#8FAABB" },
  green:  { bg: "#EAF3DE", border: "#B5D4B0" },
};

const PANEL_ICON_BG: Record<SalesModuleAccent, string> = {
  blue:   "#EAF4FB",
  teal:   "#E1F5EE",
  red:    "#FDECEA",
  amber:  "#FDF3E3",
  purple: "#EEEDFE",
  dark:   "#E8EDF2",
  green:  "#EAF3DE",
};

const CONN_STATUS_STYLE: Record<
  SalesModuleConnectionStatus,
  { bg: string; color: string; label: string }
> = {
  live: { bg: "#E1F5EE", color: "#0F6E56", label: "設計已對應" },
  sim:  { bg: "#FDF3E3", color: "#854F0B", label: "Phase 2 真實串接" },
  p2:   { bg: "#F1EFE8", color: "#5A5955", label: "Phase 2 規劃中" },
};

const FILE_BADGE_STYLE: Record<
  SalesModuleFileVersionTone,
  { bg: string; color: string }
> = {
  v2:   { bg: "#EAF4FB", color: "#185FA5" },
  gray: { bg: "#F1EFE8", color: "#5A5955" },
  new:  { bg: "#FDECEA", color: "#C8001A" },
};

const TABS = [
  { key: "modules",     label: "📋 模組總覽" },
  { key: "connections", label: "🔗 串接關係圖" },
  { key: "principles",  label: "📐 設計原則" },
  { key: "files",       label: "📁 檔案清單" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function SalesOverviewBoard({ data }: { data: SalesOverviewData }) {
  useSetPageHeader({
    title: "銷售模組導覽",
    breadcrumb: [{ label: "銷售接待" }, { label: "銷售模組導覽" }],
  });

  const [tab, setTab] = useState<TabKey>("modules");
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    window.clearTimeout((window as unknown as { __soToast?: number }).__soToast);
    (window as unknown as { __soToast?: number }).__soToast = window.setTimeout(
      () => setToast(null),
      2500,
    ) as unknown as number;
  };

  return (
    <main className="px-6 py-5 space-y-4" data-testid="sales-overview-page">
      {/* Hero */}
      <div
        className="rounded-xl p-7 text-white flex items-center justify-between flex-wrap gap-4 relative overflow-hidden"
        style={{ background: "linear-gradient(135deg,#0D2B47 0%,#1A3A5C 45%,#8B0010 100%)" }}
      >
        <div className="relative z-10 max-w-[640px]">
          <h1 className="text-[20px] font-bold mb-1.5 tracking-wide">🏍️ {data.hero.title}</h1>
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
            data-testid="sales-overview-kpi"
          >
            <div className="text-[10.5px] text-[#9A9890] mb-1">{k.label}</div>
            <div
              className="text-[22px] font-bold font-mono leading-none mb-0.5"
              style={{
                color:
                  k.tone === "blue"  ? "#185FA5" :
                  k.tone === "teal"  ? "#0F6E56" :
                  k.tone === "amber" ? "#854F0B" :
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
              data-testid={`sales-overview-tab-${t.key}`}
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
        <div className="space-y-3.5">
          {/* SVG flow 用 panel 包一下 + scroll */}
          <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
            <PanelHeader
              icon="🔗"
              iconBg="#FDECEA"
              title="模組串接關係圖"
              subtitle="資料流向 · 主管設定下發 · RS 前台串接"
            />
            <div className="px-4 py-3.5 overflow-x-auto">
              <ConnectionsFlowChart />
            </div>
          </section>

          {/* 串接關係明細表 */}
          <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
            <PanelHeader
              icon="📋"
              iconBg="#EAF4FB"
              title="串接關係明細"
              subtitle="資料流向 · 串接狀態說明"
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
                    return (
                      <tr key={i} className="hover:bg-[#FAFAF8]">
                        <td className="px-3 py-2.5 border-b border-[#F4F3F0] text-[11.5px] font-semibold font-mono text-[#1A3A5C] align-top">
                          {c.from}
                        </td>
                        <td className="px-1.5 py-2.5 border-b border-[#F4F3F0] text-[14px] font-bold text-[#C8001A]">→</td>
                        <td className="px-3 py-2.5 border-b border-[#F4F3F0] text-[11.5px] font-mono text-[#534AB7] align-top">
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
        </div>
      )}

      {tab === "principles" && (
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <PanelHeader
            icon="📐"
            iconBg="#E8EDF2"
            title="系統設計核心原則"
            subtitle="v6.1 現行六項原則"
          />
          <div className="px-4 py-3.5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {data.principles.map((pr) => (
                <div
                  key={pr.code}
                  className="bg-[#F8F7F4] border border-[#EEECE6] rounded-lg px-4 py-3.5"
                  data-testid={`sales-overview-principle-${pr.code}`}
                >
                  <div className="text-[10px] font-mono font-bold text-[#9A9890] mb-1.5">{pr.code}</div>
                  <div className="text-[13px] font-bold text-[#1A3A5C] mb-1.5">{pr.title}</div>
                  <div className="text-[12px] text-[#5A5955] leading-[1.65]">{pr.description}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {tab === "files" && (
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <PanelHeader
            icon="📁"
            iconBg="#E1F5EE"
            title="完整檔案清單"
            subtitle="v6.1 現行版本 · 14 個模組"
          />
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["代碼", "中文檔名", "版本", "最後更新", "說明"].map((h) => (
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
                {data.files.map((f) => {
                  const sty = FILE_BADGE_STYLE[f.versionTone];
                  return (
                    <tr key={f.code} className="hover:bg-[#FAFAF8]">
                      <td className="px-3 py-2.5 border-b border-[#F4F3F0] text-[11.5px] font-semibold font-mono text-[#1A3A5C]">
                        {f.code}
                      </td>
                      <td className="px-3 py-2.5 border-b border-[#F4F3F0] text-[12px] text-[#2C2C2A]">{f.fileName}</td>
                      <td className="px-3 py-2.5 border-b border-[#F4F3F0]">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded text-[10.5px] font-semibold whitespace-nowrap"
                          style={{ background: sty.bg, color: sty.color }}
                        >
                          {f.version}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 border-b border-[#F4F3F0] text-[12px] text-[#5A5955]">{f.releaseTag}</td>
                      <td className="px-3 py-2.5 border-b border-[#F4F3F0] text-[12px] text-[#5A5955]">{f.description}</td>
                    </tr>
                  );
                })}
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
          data-testid="sales-overview-toast"
        >
          {toast}
        </div>
      )}
    </main>
  );
}

// ─── 子元件 ─────────────────────────────────────────────

function PanelHeader({
  icon, iconBg, title, subtitle, emphasis,
}: {
  icon: string;
  iconBg: string;
  title: string;
  subtitle: string;
  emphasis?: "teal" | "navy";
}) {
  const headerStyle: React.CSSProperties =
    emphasis === "teal"
      ? { background: "linear-gradient(90deg,#0C5A46,#0F6E56)", color: "#fff" }
      : emphasis === "navy"
      ? { background: "linear-gradient(90deg,#0D2438,#1A3A5C)", color: "#fff" }
      : { background: "#FAFAF8" };

  const titleColor = emphasis ? "#fff" : "#2C2C2A";
  const subColor = emphasis ? "rgba(255,255,255,.7)" : "#9A9890";

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
      <div>
        <div className="text-[13px] font-semibold" style={{ color: titleColor }}>
          {title}
        </div>
        <div className="text-[11px] mt-0.5" style={{ color: subColor }}>
          {subtitle}
        </div>
      </div>
    </header>
  );
}

function PanelBlock({
  panel,
  onCardClick,
}: {
  panel: SalesModulePanel;
  onCardClick: (c: SalesModuleCard) => void;
}) {
  const gridCols = panel.gridCols === 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-2 md:grid-cols-3";
  return (
    <section
      className="bg-white border rounded-lg overflow-hidden"
      style={{
        borderColor:
          panel.emphasis === "teal" ? "#5DCAA5" :
          panel.emphasis === "navy" ? "#8FAABB" : "#EEECE6",
      }}
    >
      <PanelHeader
        icon={panel.icon}
        iconBg={PANEL_ICON_BG[panel.accent]}
        title={panel.title}
        subtitle={panel.subtitle}
        emphasis={panel.emphasis === "default" ? undefined : panel.emphasis}
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
        <div className={`grid ${gridCols} gap-2.5`}>
          {panel.cards.map((card) => (
            <ModuleCard key={`${panel.key}-${card.code}`} card={card} onClick={() => onCardClick(card)} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ModuleCard({ card, onClick }: { card: SalesModuleCard; onClick: () => void }) {
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
      data-testid={`sales-overview-card-${card.code}`}
    >
      {card.versionTone === "new" ? (
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
      <div className="text-[13px] font-bold mb-1 leading-[1.3] pr-12">{card.name}</div>
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

function ConnectionsFlowChart() {
  // 重畫一份簡化的 4 層 swim-lane SVG（背景區塊 + 主節點），維持原稿意象
  return (
    <svg
      viewBox="0 0 980 460"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full min-w-[960px]"
      style={{ fontFamily: "'Noto Sans TC',sans-serif" }}
    >
      <defs>
        <marker id="arr-red" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
          <polygon points="0 0,8 3,0 6" fill="#C8001A" />
        </marker>
        <marker id="arr-blue" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
          <polygon points="0 0,8 3,0 6" fill="#185FA5" />
        </marker>
        <marker id="arr-teal" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
          <polygon points="0 0,8 3,0 6" fill="#0F6E56" />
        </marker>
      </defs>

      {/* swim-lane 背景 */}
      <rect x="10" y="10" width="200" height="430" rx="8" fill="#E8EDF2" opacity=".4" />
      <text x="110" y="30" textAnchor="middle" fontSize="10" fontWeight="700" fill="#3A5A6C">
        主管／設定層
      </text>

      <rect x="230" y="10" width="260" height="430" rx="8" fill="#EAF4FB" opacity=".35" />
      <text x="360" y="30" textAnchor="middle" fontSize="10" fontWeight="700" fill="#185FA5">
        RS 前台作業層
      </text>

      <rect x="510" y="10" width="220" height="430" rx="8" fill="#EEEDFE" opacity=".35" />
      <text x="620" y="30" textAnchor="middle" fontSize="10" fontWeight="700" fill="#534AB7">
        CRM 追蹤層
      </text>

      <rect x="750" y="10" width="220" height="430" rx="8" fill="#E1F5EE" opacity=".35" />
      <text x="860" y="30" textAnchor="middle" fontSize="10" fontWeight="700" fill="#0F6E56">
        衍生業務層
      </text>

      {/* 主管設定層節點 */}
      <rect x="20" y="50" width="180" height="52" rx="7" fill="#1A3A5C" />
      <text x="110" y="71" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">RS_M3 主管設定</text>
      <text x="110" y="87" textAnchor="middle" fontSize="9.5" fill="rgba(255,255,255,.7)">KPI / 九宮格 / 標籤 / 保險</text>

      <rect x="20" y="130" width="180" height="44" rx="7" fill="#3B6D11" />
      <text x="110" y="150" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">RS_SET 參數設定</text>
      <text x="110" y="164" textAnchor="middle" fontSize="9.5" fill="rgba(255,255,255,.7)">來源 / 競品 / 功能開關</text>

      <rect x="20" y="200" width="180" height="44" rx="7" fill="#3B6D11" opacity=".85" />
      <text x="110" y="220" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">RS_SET2 標籤管理</text>
      <text x="110" y="234" textAnchor="middle" fontSize="9.5" fill="rgba(255,255,255,.7)">RS 自訂 · 主管觀察</text>

      <rect x="20" y="270" width="180" height="44" rx="7" fill="#534AB7" />
      <text x="110" y="290" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">RS_M1 銷售漏斗看板</text>
      <text x="110" y="304" textAnchor="middle" fontSize="9.5" fill="rgba(255,255,255,.7)">KPI / PULS / 客群畫像</text>

      <rect x="20" y="340" width="180" height="44" rx="7" fill="#534AB7" opacity=".8" />
      <text x="110" y="360" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">RS_M2 業績報表</text>
      <text x="110" y="374" textAnchor="middle" fontSize="9.5" fill="rgba(255,255,255,.7)">損益 / RS排行 / 趨勢</text>

      {/* RS 前台節點 */}
      <rect x="242" y="50" width="236" height="52" rx="7" fill="#185FA5" />
      <text x="360" y="71" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">RS01 電子手卡</text>
      <text x="360" y="87" textAnchor="middle" fontSize="9.5" fill="rgba(255,255,255,.7)">四身份 / HABC / 標籤 / 跳轉</text>

      <rect x="242" y="138" width="110" height="44" rx="7" fill="#0F6E56" />
      <text x="297" y="158" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">RS02 試駕</text>
      <text x="297" y="172" textAnchor="middle" fontSize="9.5" fill="rgba(255,255,255,.7)">黃金時刻提示</text>

      <rect x="368" y="138" width="110" height="44" rx="7" fill="#854F0B" />
      <text x="423" y="158" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">RS06 鑑價</text>
      <text x="423" y="172" textAnchor="middle" fontSize="9.5" fill="rgba(255,255,255,.7)">Desmo / 認證</text>

      <rect x="242" y="215" width="110" height="44" rx="7" fill="#185FA5" opacity=".75" />
      <text x="297" y="235" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">RS03A 新車庫</text>
      <text x="297" y="249" textAnchor="middle" fontSize="9.5" fill="rgba(255,255,255,.7)">庫存狀態</text>

      <rect x="368" y="215" width="110" height="44" rx="7" fill="#534AB7" opacity=".75" />
      <text x="423" y="235" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">RS03B 中古庫</text>
      <text x="423" y="249" textAnchor="middle" fontSize="9.5" fill="rgba(255,255,255,.7)">CPO/DPO/PO</text>

      {/* CRM 層節點 */}
      <rect x="522" y="50" width="196" height="52" rx="7" fill="#534AB7" />
      <text x="620" y="71" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">CRM01A 客戶基盤</text>
      <text x="620" y="87" textAnchor="middle" fontSize="9.5" fill="rgba(255,255,255,.7)">HABC / 列表 / 看板</text>

      <rect x="522" y="138" width="196" height="52" rx="7" fill="#534AB7" opacity=".8" />
      <text x="620" y="158" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">CRM03A 電訪工作台</text>
      <text x="620" y="174" textAnchor="middle" fontSize="9.5" fill="rgba(255,255,255,.7)">D+3/D+7 / 話術 / 記錄</text>

      {/* 衍生業務層 */}
      <rect x="762" y="50" width="196" height="52" rx="7" fill="#C8001A" />
      <text x="860" y="71" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">RS_EX1 前端續保招攬</text>
      <text x="860" y="87" textAnchor="middle" fontSize="9.5" fill="rgba(255,255,255,.7)">到期提醒 / 話術 / 佣金</text>

      {/* 主要連線 */}
      <line x1="200" y1="76" x2="240" y2="76" stroke="#1A3A5C" strokeWidth="1.5" markerEnd="url(#arr-blue)" strokeDasharray="5,3" />
      <line x1="478" y1="76" x2="520" y2="76" stroke="#534AB7" strokeWidth="1.5" markerEnd="url(#arr-blue)" />
      <line x1="620" y1="102" x2="620" y2="136" stroke="#534AB7" strokeWidth="1.5" markerEnd="url(#arr-blue)" />
      <line x1="297" y1="102" x2="297" y2="136" stroke="#0F6E56" strokeWidth="1.5" markerEnd="url(#arr-teal)" />
      <line x1="423" y1="102" x2="423" y2="136" stroke="#854F0B" strokeWidth="1.5" markerEnd="url(#arr-red)" />
      <line x1="297" y1="182" x2="297" y2="213" stroke="#185FA5" strokeWidth="1" markerEnd="url(#arr-blue)" strokeDasharray="4,3" />
      <line x1="423" y1="182" x2="423" y2="213" stroke="#534AB7" strokeWidth="1" markerEnd="url(#arr-blue)" strokeDasharray="4,3" />
      <path d="M478,76 Q700,76 760,76" stroke="#C8001A" strokeWidth="1.5" fill="none" markerEnd="url(#arr-red)" />

      {/* 圖例 */}
      <rect x="22" y="395" width="936" height="50" rx="8" fill="#F8F7F4" stroke="#EEECE6" strokeWidth="1" />
      <text x="40" y="413" fontSize="10" fontWeight="700" fill="#5A5955">圖例</text>
      <line x1="80" y1="428" x2="120" y2="428" stroke="#1A3A5C" strokeWidth="2" markerEnd="url(#arr-blue)" />
      <text x="128" y="431" fontSize="10" fill="#4A4A48">主管設定下發</text>
      <line x1="240" y1="428" x2="280" y2="428" stroke="#534AB7" strokeWidth="2" markerEnd="url(#arr-blue)" />
      <text x="288" y="431" fontSize="10" fill="#4A4A48">資料同步/跳轉</text>
      <line x1="400" y1="428" x2="440" y2="428" stroke="#0F6E56" strokeWidth="2" markerEnd="url(#arr-teal)" />
      <text x="448" y="431" fontSize="10" fill="#4A4A48">流程銜接</text>
      <line x1="540" y1="428" x2="580" y2="428" stroke="#C8001A" strokeWidth="1.5" markerEnd="url(#arr-red)" />
      <text x="588" y="431" fontSize="10" fill="#4A4A48">衍生業務觸發</text>
    </svg>
  );
}
