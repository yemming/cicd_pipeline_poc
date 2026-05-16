import Link from "next/link";

import { getAftersalesModuleProgress } from "@/domain/navigation";

/**
 * <AftersalesFlowDiagram> — 售後修護模組導覽 / 流程關係圖共用 server component
 *
 * 對應設計稿：docs/DUCATI_售後工單模組_完整且含串接庫存版_20260510_最新版/00_售後工單模組_流程關係圖.html
 * 同時 render 在 `/parts/aftersales` 與 `/service` 兩個 route（Phase 3B C0a 共用元件）。
 *
 * Prop `backHref` / `backLabel` 控制右上角連結，讓兩 route 各自指回所屬模組根。
 *
 * 結構：
 *   1. Header banner（深藍 hero）
 *   2. Legend + Stats（4 KPI scorecard，3 動態 + 1 hardcode）
 *   3. 6 Phase（橫向 pipeline）
 *   4. 3 側功能群（增項閉環 / 人車檔案 / 系統設定）
 *
 * 不引入新 entity、不寫 DB；KPI 從 nav_nodes 算（src/domain/navigation.ts）。
 * Phase 結構與節點視覺 tag hardcode 在本檔（避免污染 nav_nodes schema）。
 */

type NodeTone = "done" | "new" | "key" | "purple" | "amber" | "green" | "gray";
type PhaseTone = "teal" | "blue" | "red" | "purple" | "green" | "amber";

type FlowNode = {
  num: string;
  name: string;
  tone: NodeTone;
  /** 對應 nav_nodes.href；有就跳轉、沒有就 disabled */
  href?: string;
  /** badge label override（例：「同頁整合」「v3」） */
  status?: string;
  /** 標星 emphasis（描邊加粗 — 對應原稿 ⭐） */
  emphasis?: boolean;
};

type Phase = {
  title: string;
  tone: PhaseTone;
  nodes: FlowNode[];
  /** 串接小提示（顯示在 phase 底部、灰底淺紫字） */
  connector?: string;
};

type SideGroup = {
  title: string;
  tone: PhaseTone;
  nodes: FlowNode[];
};

// ── 6 個主流程 Phase（依原稿 00_售後工單模組_流程關係圖.html）──────────────
const PHASES: Phase[] = [
  {
    title: "📅 預約與進廠管理",
    tone: "blue",
    nodes: [
      { num: "1.1", name: "預約管理看板", tone: "done", href: "/parts/aftersales/appointments" },
      { num: "1.2", name: "技師工作負載", tone: "done", status: "同頁整合" },
    ],
  },
  {
    title: "🔍 SA 修護接待（預檢五關・同一頁面 Tab 切換）",
    tone: "teal",
    nodes: [
      { num: "2.1 Tab1", name: "環車預檢", tone: "done", href: "/parts/aftersales/pre-inspections" },
      { num: "2.2 Tab2", name: "來意詢問 + 客戶標籤", tone: "done" },
      { num: "2.3 Tab3", name: "技師深入檢查", tone: "done" },
      { num: "2.4 Tab4", name: "SA 報價彙整", tone: "done" },
      { num: "2.5 Tab5", name: "車主第一次簽名", tone: "done", emphasis: true },
    ],
    connector: "暫緩 / 拒絕項目 → 自動建立增項閉環追蹤",
  },
  {
    title: "📋 正式工單（RO）開立（資料自動帶入，SA 30 秒完成）",
    tone: "red",
    nodes: [
      { num: "3.1", name: "RO 工單極簡確認卡", tone: "key", href: "/parts/aftersales/repair-orders/new" },
      { num: "3.2", name: "維修項目零件明細", tone: "key", href: "/parts/aftersales/repair-orders/lines" },
      { num: "3.3", name: "工單列表查詢", tone: "new", href: "/parts/aftersales/repair-orders" },
    ],
  },
  {
    title: "👨‍🔧 車間管理（工位看板 + 技師打卡整合在同一頁面）",
    tone: "purple",
    nodes: [
      { num: "4.1", name: "工位看板（圖形化）", tone: "done", href: "/parts/aftersales/management/bays" },
      { num: "4.2", name: "技師派工看板", tone: "done", href: "/parts/aftersales/management/dispatch" },
      { num: "4.3 🆕", name: "技師電子打卡", tone: "done", emphasis: true, status: "點工位即打卡" },
      { num: "4.4 🆕", name: "完工交棒（30 秒）", tone: "done", emphasis: true, status: "推進至複檢" },
    ],
  },
  {
    title: "✅ 竣工複檢 + 取車通知",
    tone: "green",
    nodes: [
      { num: "5.1", name: "五步驟竣工複檢", tone: "done", href: "/parts/aftersales/final-inspections" },
      { num: "5.2", name: "職級授權電子簽核", tone: "done" },
      { num: "5.3", name: "取車通知推播設定", tone: "new", href: "/parts/aftersales/settings/pickup-notify" },
    ],
  },
  {
    title: "💳 結帳收款與關單（含車主第二次簽名）",
    tone: "green",
    nodes: [
      { num: "6.1", name: "費用明細確認", tone: "new", href: "/parts/aftersales/checkout" },
      { num: "6.2 ⭐", name: "車主第二次確認簽名", tone: "key", emphasis: true, status: "Day 2 重點" },
      { num: "6.3", name: "收款方式 / 發票開立", tone: "new" },
      { num: "6.4", name: "RO 關單 / 存檔 36 個月", tone: "new" },
    ],
  },
];

// ── 3 個側功能群（與主 pipeline 並列顯示在底部）────────────────────────────
const SIDE_GROUPS: SideGroup[] = [
  {
    title: "🔄 增項閉環（完整子模組）",
    tone: "red",
    nodes: [
      { num: "7.1", name: "待追蹤看板（安全等級置頂）", tone: "done", href: "/parts/aftersales/followups" },
      { num: "7.2", name: "D+3 / D+10 追蹤時間軸", tone: "done" },
      { num: "7.3", name: "整店統計 / SA 閉環績效", tone: "done" },
      { num: "7.4", name: "車主同意 → 一鍵預約回廠", tone: "done" },
    ],
  },
  {
    title: "👤 人車檔案",
    tone: "purple",
    nodes: [
      { num: "8.1", name: "客戶基本資料卡", tone: "new", href: "/parts/aftersales/customers" },
      { num: "8.2", name: "車輛維修履歷", tone: "new" },
      { num: "8.3", name: "保固狀態追蹤", tone: "new" },
    ],
  },
  {
    title: "⚙️ 系統設定",
    tone: "amber",
    nodes: [
      { num: "9.1", name: "員工人員名冊", tone: "done", href: "/parts/aftersales/management/staff" },
      { num: "9.2", name: "工單前綴碼設定", tone: "done", href: "/parts/aftersales/management/ro-numbering" },
      { num: "9.3", name: "客戶標籤主管設定", tone: "new", href: "/parts/aftersales/settings/customer-tags" },
    ],
  },
];

// ── 視覺 token（對應 design pattern 色票，phase / node 兩套）────────────────
const NODE_TONES: Record<NodeTone, { bg: string; border: string; name: string; status: string }> = {
  done:   { bg: "#E1F5EE", border: "#5DCAA5", name: "#085041", status: "#0F6E56" },
  new:    { bg: "#EAF4FB", border: "#85B7EB", name: "#0C3E70", status: "#185FA5" },
  key:    { bg: "#FDECEA", border: "#F5AEAD", name: "#7A1010", status: "#CC0000" },
  purple: { bg: "#EEEDFE", border: "#AFA9EC", name: "#26215C", status: "#534AB7" },
  amber:  { bg: "#FDF3E3", border: "#F0C97E", name: "#6B3A00", status: "#854F0B" },
  green:  { bg: "#EAF3DE", border: "#B5D4B0", name: "#084D30", status: "#3B6D11" },
  gray:   { bg: "#F1EFE8", border: "#B4B2A9", name: "#3A3A38", status: "#5A5955" },
};

const PHASE_TONES: Record<PhaseTone, { bg: string; border: string; header: string }> = {
  blue:   { bg: "#EAF4FB", border: "#85B7EB", header: "#0C3E70" },
  teal:   { bg: "#E1F5EE", border: "#5DCAA5", header: "#085041" },
  red:    { bg: "#FDECEA", border: "#F5AEAD", header: "#7A1010" },
  purple: { bg: "#EEEDFE", border: "#AFA9EC", header: "#26215C" },
  green:  { bg: "#EAF3DE", border: "#B5D4B0", header: "#084D30" },
  amber:  { bg: "#FDF3E3", border: "#F0C97E", header: "#6B3A00" },
};

// 將 nav_nodes 的 page_kind 對映回 node tone（讓「實際開發狀態」蓋過 hardcode 的視覺 hint）
function statusLabel(pageKind: string | undefined): string | undefined {
  switch (pageKind) {
    case "react_route": return "✅ 已上線";
    case "static_html": return "🔵 設計稿";
    case "iframe":      return "🔵 iframe";
    case "placeholder": return "灰 占位";
    default: return undefined;
  }
}

export type AftersalesFlowDiagramProps = {
  /** 右上角返回連結；不傳就不顯示 */
  backHref?: string;
  /** 連結文字（預設「← 模組總覽」） */
  backLabel?: string;
};

export default async function AftersalesFlowDiagram({
  backHref,
  backLabel = "← 模組總覽",
}: AftersalesFlowDiagramProps = {}) {
  const progress = await getAftersalesModuleProgress();

  return (
    <main className="px-6 py-5 space-y-3" data-testid="aftersales-flow-diagram">
      {/* ── 1. Hero header ───────────────────────────────────────── */}
      <header className="bg-[#1A3A5C] text-white rounded-lg px-5 py-3 flex items-center gap-4 shadow">
        <div className="text-[17px] font-bold tracking-[2px]">DUCATI</div>
        <div className="w-px h-5 bg-white/20" />
        <div className="text-[13px] text-white/60">
          售後工單模組 <b className="text-white font-medium">功能流程關係圖</b>
        </div>
        <div className="ml-auto flex items-center gap-3 text-[12px] text-white/50">
          <span>版本 v2.0 · <b className="text-[#5BC4A8]">2026/05/15</b></span>
          {backHref && (
            <Link
              href={backHref}
              className="px-3.5 py-1 rounded-md bg-white/10 text-white text-[12px] border border-white/15 hover:bg-white/20"
            >
              {backLabel}
            </Link>
          )}
        </div>
      </header>

      {/* ── 2a. Legend ─────────────────────────────────────────── */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-2.5 flex items-center gap-5 flex-wrap text-[11.5px] text-[#6B6A68]">
        <span className="font-medium text-[#5A5955]">圖例：</span>
        {[
          { c: "#5DCAA5", t: "✅ 已完成" },
          { c: "#85B7EB", t: "🔵 待開發" },
          { c: "#F5AEAD", t: "🔴 核心關鍵" },
          { c: "#AFA9EC", t: "🟣 跨頁共用" },
          { c: "#F0C97E", t: "🟡 支線流程" },
        ].map((l) => (
          <span key={l.t} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: l.c }} />
            {l.t}
          </span>
        ))}
      </section>

      {/* ── 2b. Stats（KPI scorecard × 4）─────────────────────── */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <ScoreCard label="已完成頁面" value={`${progress.completed_count} 支`} valueColor="#3B6D11" />
        <ScoreCard label="待開發頁面" value={`${progress.pending_count} 支`} valueColor="#185FA5" />
        <ScoreCard label="剩餘 Sessions" value={progress.planned_sessions} valueColor="#1A3A5C" />
        <ScoreCard label="與庫存模組串接點" value={`${progress.inventory_link_count} 個`} valueColor="#534AB7" />
      </section>

      {/* ── 3. 6 Phase pipeline ────────────────────────────────── */}
      <section className="space-y-2">
        {PHASES.map((p, i) => (
          <div key={p.title}>
            <PhaseBlock phase={p} nodeStatus={progress.node_status} />
            {i < PHASES.length - 1 && (
              <div className="text-center text-[18px] text-[#D5D3CB] py-1 leading-none">↓</div>
            )}
          </div>
        ))}
      </section>

      {/* ── 4. 側功能群（3 col grid）──────────────────────────── */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mt-2">
        {SIDE_GROUPS.map((g) => (
          <SideGroupBlock key={g.title} group={g} nodeStatus={progress.node_status} />
        ))}
      </section>

      {/* footer 小註 */}
      <p className="text-[11px] text-[#9A9890] text-center pt-3">
        節點開發狀態由 nav_nodes.page_kind 即時計算（react_route = 已上線、static_html = 設計稿）。
      </p>
    </main>
  );
}

// ────────────────────────────────────────────────────────────────────
// Subcomponents
// ────────────────────────────────────────────────────────────────────

function ScoreCard({ label, value, valueColor }: { label: string; value: string; valueColor: string }) {
  return (
    <div className="bg-white border border-[#EEECE6] rounded-lg px-3.5 py-2.5">
      <div className="text-[11px] text-[#9A9890]">{label}</div>
      <div className="text-[20px] font-bold mt-0.5" style={{ color: valueColor }}>{value}</div>
    </div>
  );
}

function PhaseBlock({
  phase,
  nodeStatus,
}: {
  phase: Phase;
  nodeStatus: Record<string, string | "missing">;
}) {
  const tone = PHASE_TONES[phase.tone];
  return (
    <div
      className="rounded-lg overflow-hidden border"
      style={{ background: tone.bg, borderColor: tone.border }}
    >
      <div
        className="px-4 py-2 text-[11px] font-semibold tracking-[0.5px] uppercase"
        style={{ color: tone.header }}
      >
        {phase.title}
      </div>
      <div className="px-3 py-3 bg-white flex items-start gap-1.5 flex-wrap">
        {phase.nodes.map((n, i) => (
          <div key={`${n.num}-${i}`} className="flex items-start gap-1.5">
            <NodeCard node={n} nodeStatus={nodeStatus} />
            {i < phase.nodes.length - 1 && (
              <span className="text-[16px] text-[#D5D3CB] pt-4 select-none">→</span>
            )}
          </div>
        ))}
      </div>
      {phase.connector && (
        <div className="px-4 py-1.5 bg-[#F8F7F4] border-t border-[#EEECE6] text-[11px] text-[#534AB7] font-medium flex items-center gap-2">
          <span className="flex-1 h-px bg-[#D5D3CB]" />
          <span>{phase.connector}</span>
          <span className="flex-1 h-px bg-[#D5D3CB]" />
        </div>
      )}
    </div>
  );
}

function SideGroupBlock({
  group,
  nodeStatus,
}: {
  group: SideGroup;
  nodeStatus: Record<string, string | "missing">;
}) {
  const tone = PHASE_TONES[group.tone];
  return (
    <div
      className="rounded-lg overflow-hidden border"
      style={{ background: tone.bg, borderColor: tone.border }}
    >
      <div
        className="px-4 py-2 text-[11px] font-semibold tracking-[0.5px] uppercase"
        style={{ color: tone.header }}
      >
        {group.title}
      </div>
      <div className="px-3 py-3 bg-white flex flex-col gap-1.5">
        {group.nodes.map((n, i) => (
          <NodeCard key={`${n.num}-${i}`} node={n} nodeStatus={nodeStatus} fullWidth />
        ))}
      </div>
    </div>
  );
}

function NodeCard({
  node,
  nodeStatus,
  fullWidth = false,
}: {
  node: FlowNode;
  nodeStatus: Record<string, string | "missing">;
  fullWidth?: boolean;
}) {
  const tone = NODE_TONES[node.tone];
  // 用 nav_nodes 的真實 page_kind 蓋過 hardcode 的 status；沒對映就 fallback 到 hardcode
  const dynamicLabel = node.href ? statusLabel(nodeStatus[node.href]) : undefined;
  const label = dynamicLabel ?? node.status ?? "—";

  const inner = (
    <div
      className="rounded-lg px-2.5 py-2 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md"
      style={{
        background: tone.bg,
        border: `${node.emphasis ? 2 : 1.5}px solid ${tone.border}`,
        minWidth: fullWidth ? undefined : 130,
        maxWidth: fullWidth ? undefined : 180,
        width: fullWidth ? "100%" : undefined,
        flexShrink: 0,
      }}
    >
      <div className="text-[10px] font-mono opacity-65" style={{ color: tone.name }}>
        {node.num}
      </div>
      <div className="text-[12px] font-semibold leading-snug mt-0.5" style={{ color: tone.name }}>
        {node.name}
      </div>
      <div className="text-[10px] mt-1 flex items-center gap-1" style={{ color: tone.status }}>
        {label}
      </div>
    </div>
  );

  if (node.href) {
    return (
      <Link href={node.href} className="block" data-testid={`node-${node.num.replace(/\s+/g, "")}`}>
        {inner}
      </Link>
    );
  }
  return (
    <div data-testid={`node-${node.num.replace(/\s+/g, "")}`} className="opacity-90">
      {inner}
    </div>
  );
}
