/**
 * Visualization Sandbox Board — client，跑互動 demo（拖曳 / toggle / 樹狀展收）。
 */

"use client";

import { useState } from "react";
import {
  KpiCard,
  StatusDot,
  KanbanBoard,
  Timeline,
  FlowDiagram,
  HierarchyTree,
  MatrixSelector,
  type KanbanCard,
  type ToneKey,
  type TreeNode,
} from "@/components/visualization";

const TONES: ToneKey[] = ["blue", "teal", "amber", "red", "purple", "green", "gray"];

function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
      <h2 className="text-[13px] font-semibold text-[#2C2C2A]">▼ {title}</h2>
      {hint ? <p className="text-[11.5px] text-[#9A9890] mt-0.5">{hint}</p> : null}
    </header>
  );
}

export default function VisualizationSandboxBoard() {
  // ───── Kanban state ─────
  const [kanbanCards, setKanbanCards] = useState<KanbanCard[]>([
    { id: "k1", columnId: "todo", content: <span>需求單 #1024 — 改新增按鈕色</span> },
    { id: "k2", columnId: "todo", content: <span>需求單 #1031 — 報表加欄位</span> },
    { id: "k3", columnId: "doing", content: <span>許願單 #87 — 加 KPI 卡</span> },
    { id: "k4", columnId: "review", content: <span>許願單 #82 — Timeline 卡頓</span> },
    { id: "k5", columnId: "done", content: <span>許願單 #80 — 黑暗模式</span> },
  ]);
  const [lastMove, setLastMove] = useState<string>("(尚未拖曳)");

  // ───── Matrix state ─────
  const matrixRows = [
    { id: "admin", label: "Admin" },
    { id: "manager", label: "Manager" },
    { id: "sales", label: "Sales" },
    { id: "tech", label: "Technician" },
  ];
  const matrixCols = [
    { id: "view", label: "檢視" },
    { id: "edit", label: "編輯" },
    { id: "delete", label: "刪除" },
    { id: "export", label: "匯出" },
  ];
  const [matrix, setMatrix] = useState<Record<string, Record<string, boolean>>>({
    admin: { view: true, edit: true, delete: true, export: true },
    manager: { view: true, edit: true, delete: false, export: true },
    sales: { view: true, edit: false, delete: false, export: false },
    tech: { view: true, edit: true, delete: false, export: false },
  });

  // ───── Tree state ─────
  const [selectedTreeId, setSelectedTreeId] = useState<string>("indian-tp");
  const treeData: TreeNode[] = [
    {
      id: "indian",
      label: "Indian 集團",
      badge: (
        <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-tone-blue-50 text-tone-blue-700 border border-tone-blue-100">
          group
        </span>
      ),
      children: [
        {
          id: "indian-north",
          label: "北區",
          children: [
            { id: "indian-tp", label: "台北旗艦店", badge: <StatusDot tone="green" size="sm" /> },
            { id: "indian-tao", label: "桃園展示中心", badge: <StatusDot tone="amber" size="sm" pulse /> },
          ],
        },
        {
          id: "indian-south",
          label: "南區",
          children: [{ id: "indian-kh", label: "高雄旗艦店", badge: <StatusDot tone="gray" size="sm" /> }],
        },
      ],
    },
    {
      id: "ducati",
      label: "Ducati 集團",
      children: [{ id: "ducati-tp", label: "Ming Taipei", badge: <StatusDot tone="green" size="sm" /> }],
    },
  ];

  return (
    <div className="space-y-6">
      {/* ─────────────────────────────────── 1. KpiCard ─────────────────────────────────── */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <SectionHeader title="1. KpiCard — 4 layout" hint="horizontal / vertical / mini / with-chart" />
        <div className="p-4 space-y-4">
          {/* horizontal */}
          <div>
            <div className="text-[11px] text-tone-gray-500 mb-2">horizontal layout × 7 tone</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {TONES.map((tone, i) => (
                <KpiCard
                  key={tone}
                  tone={tone}
                  layout="horizontal"
                  label={`KPI · ${tone}`}
                  value={(i + 1) * 13}
                  delta={{ value: (i % 2 === 0 ? 1 : -1) * (i + 2) }}
                  icon={<span className="text-[16px]">★</span>}
                />
              ))}
            </div>
          </div>

          {/* vertical */}
          <div>
            <div className="text-[11px] text-tone-gray-500 mb-2">vertical layout</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard tone="blue" layout="vertical" label="本月銷售" value="42 台" delta={{ value: 12 }} icon={<span>📈</span>} href="#" />
              <KpiCard tone="amber" layout="vertical" label="待辦許願" value={8} delta={{ value: -3 }} icon={<span>⚠</span>} />
              <KpiCard tone="teal" layout="vertical" label="完成率" value="94%" delta={{ value: 2, tone: "positive" }} icon={<span>✓</span>} />
              <KpiCard tone="red" layout="vertical" label="逾期工單" value={3} delta={{ value: 0, tone: "neutral" }} icon={<span>!</span>} />
            </div>
          </div>

          {/* mini */}
          <div>
            <div className="text-[11px] text-tone-gray-500 mb-2">mini layout — 密集 KPI 列</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <KpiCard tone="blue" layout="mini" label="會員" value="1,284" />
              <KpiCard tone="green" layout="mini" label="完成" value="92" delta={{ value: 5 }} />
              <KpiCard tone="amber" layout="mini" label="待處理" value="14" delta={{ value: -2 }} />
              <KpiCard tone="red" layout="mini" label="逾期" value="3" delta={{ value: 1, tone: "negative" }} />
              <KpiCard tone="purple" layout="mini" label="高階" value="¥12.4M" />
              <KpiCard tone="teal" layout="mini" label="完成率" value="94%" />
              <KpiCard tone="gray" layout="mini" label="停用" value="6" />
              <KpiCard tone="blue" layout="mini" label="新增" value="22" delta={{ value: 8 }} />
            </div>
          </div>

          {/* with-chart */}
          <div>
            <div className="text-[11px] text-tone-gray-500 mb-2">with-chart layout — sparkline 由 caller 注入</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <KpiCard
                tone="blue"
                layout="with-chart"
                label="本週銷售"
                value="¥1.24M"
                delta={{ value: 8 }}
                icon={<span>📊</span>}
                sparkline={<MiniSparkline tone="blue" />}
              />
              <KpiCard
                tone="amber"
                layout="with-chart"
                label="維修待辦"
                value={18}
                delta={{ value: -4 }}
                icon={<span>🔧</span>}
                sparkline={<MiniSparkline tone="amber" />}
              />
              <KpiCard
                tone="teal"
                layout="with-chart"
                label="完成率"
                value="91.4%"
                delta={{ value: 2.3 }}
                icon={<span>✓</span>}
                sparkline={<MiniSparkline tone="teal" />}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────── 2. StatusDot ─────────────────────────────────── */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <SectionHeader title="2. StatusDot — 狀態圓點" hint="6 tone × 3 size、可加 pulse 動畫 / label" />
        <div className="p-4 space-y-3">
          <div className="flex gap-4 flex-wrap items-center">
            {(["green", "amber", "red", "blue", "purple", "gray"] as const).map((tone) => (
              <StatusDot key={tone} tone={tone} size="md" label={tone} />
            ))}
          </div>
          <div className="flex gap-4 flex-wrap items-center">
            <StatusDot tone="green" size="sm" label="sm" />
            <StatusDot tone="green" size="md" label="md" />
            <StatusDot tone="green" size="lg" label="lg" />
          </div>
          <div className="flex gap-4 flex-wrap items-center">
            <StatusDot tone="green" size="md" pulse label="ON-AIR" />
            <StatusDot tone="red" size="md" pulse label="逾期警示" />
            <StatusDot tone="amber" size="lg" pulse label="待處理" />
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────── 3. KanbanBoard ─────────────────────────────────── */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <SectionHeader title="3. KanbanBoard — HTML5 drag-drop 看板" hint="拖曳卡片到別欄 → 觸發 onMove；最近一次移動：" />
        <div className="p-4 space-y-3">
          <div className="text-[12px] text-tone-gray-700">
            <b>最近移動：</b>
            <code className="font-mono bg-[#F8F7F4] px-1.5 py-0.5 rounded ml-2">{lastMove}</code>
          </div>
          <KanbanBoard
            columns={[
              { id: "todo", title: "待辦", tone: "gray" },
              { id: "doing", title: "進行中", tone: "blue" },
              { id: "review", title: "審核", tone: "amber" },
              { id: "done", title: "完成", tone: "green" },
            ]}
            cards={kanbanCards}
            onMove={(cardId, from, to) => {
              setKanbanCards((prev) =>
                prev.map((c) => (c.id === cardId ? { ...c, columnId: to } : c)),
              );
              setLastMove(`${cardId}: ${from} → ${to}`);
            }}
          />
        </div>
      </section>

      {/* ─────────────────────────────────── 4. Timeline ─────────────────────────────────── */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <SectionHeader title="4. Timeline — 事件時間軸" hint="vertical / horizontal 雙版本" />
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-[11px] text-tone-gray-500 mb-2">vertical</div>
            <Timeline
              events={[
                { id: "t1", time: "2026-05-19 09:00", title: "客戶送單", tone: "blue", description: "Indian FTR 1200 預約進廠" },
                { id: "t2", time: "2026-05-19 10:30", title: "技師檢查完成", tone: "amber", description: "需更換煞車碟" },
                { id: "t3", time: "2026-05-19 11:45", title: "報價已確認", tone: "green", description: "客戶 LINE 回覆同意" },
                { id: "t4", time: "2026-05-19 14:20", title: "維修進行中", tone: "purple" },
              ]}
            />
          </div>
          <div>
            <div className="text-[11px] text-tone-gray-500 mb-2">horizontal</div>
            <Timeline
              variant="horizontal"
              events={[
                { id: "h1", time: "Q1", title: "需求收集", tone: "blue" },
                { id: "h2", time: "Q2", title: "MVP 開發", tone: "amber" },
                { id: "h3", time: "Q3", title: "封測", tone: "purple" },
                { id: "h4", time: "Q4", title: "正式上線", tone: "green" },
              ]}
            />
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────── 5. FlowDiagram ─────────────────────────────────── */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <SectionHeader title="5. FlowDiagram — SVG 流程圖" hint="currentNodeId 高亮 + pulse；horizontal / vertical" />
        <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <div className="text-[11px] text-tone-gray-500 mb-2">horizontal · CI/CD pipeline</div>
            <FlowDiagram
              orientation="horizontal"
              currentNodeId="dev"
              nodes={[
                { id: "draft", label: "草稿", tone: "gray" },
                { id: "approved", label: "已審批", tone: "blue" },
                { id: "dev", label: "開發中", tone: "amber" },
                { id: "review", label: "PR Review", tone: "purple" },
                { id: "released", label: "已上線", tone: "green" },
              ]}
              edges={[
                { from: "draft", to: "approved", label: "approve" },
                { from: "approved", to: "dev", label: "trigger" },
                { from: "dev", to: "review", label: "PR" },
                { from: "review", to: "released", label: "merge" },
              ]}
            />
          </div>
          <div>
            <div className="text-[11px] text-tone-gray-500 mb-2">vertical · 維修流程</div>
            <FlowDiagram
              orientation="vertical"
              currentNodeId="quote"
              nodes={[
                { id: "intake", label: "進廠登記", tone: "blue" },
                { id: "diag", label: "故障診斷", tone: "amber" },
                { id: "quote", label: "報價確認", tone: "purple" },
                { id: "fix", label: "維修", tone: "teal" },
                { id: "out", label: "交車", tone: "green" },
              ]}
              edges={[
                { from: "intake", to: "diag" },
                { from: "diag", to: "quote" },
                { from: "quote", to: "fix" },
                { from: "fix", to: "out" },
              ]}
            />
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────── 6. HierarchyTree ─────────────────────────────────── */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <SectionHeader
          title="6. HierarchyTree — 樹狀結構"
          hint="▶ / ▼ toggle、縮排每層 16px、選中 row bg-tone-blue-50"
        />
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-[11px] text-tone-gray-500 mb-2">
              選中：<code className="font-mono">{selectedTreeId}</code>
            </div>
            <HierarchyTree
              data={treeData}
              selectedId={selectedTreeId}
              onSelect={(n) => setSelectedTreeId(n.id)}
            />
          </div>
          <div>
            <div className="text-[11px] text-tone-gray-500 mb-2">defaultExpanded=false</div>
            <HierarchyTree data={treeData} defaultExpanded={false} />
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────── 7. MatrixSelector ─────────────────────────────────── */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <SectionHeader
          title="7. MatrixSelector — 矩陣 toggle"
          hint="row × col 交集 cell checkbox；row header sticky-left、col header sticky-top"
        />
        <div className="p-4 space-y-3">
          <div className="text-[12px] text-tone-gray-700">
            示範：RBAC 權限矩陣（角色 × 動作）— 點 cell 切換 tone
          </div>
          <MatrixSelector
            tone="blue"
            rows={matrixRows}
            cols={matrixCols}
            selected={matrix}
            onChange={(rowId, colId, value) =>
              setMatrix((prev) => ({
                ...prev,
                [rowId]: { ...(prev[rowId] ?? {}), [colId]: value },
              }))
            }
          />
        </div>
      </section>
    </div>
  );
}

/** 簡易內嵌 sparkline，純 SVG、給 KpiCard with-chart layout 試用。 */
function MiniSparkline({ tone }: { tone: ToneKey }) {
  const colorMap: Record<ToneKey, string> = {
    blue: "#3B82F6",
    teal: "#14B8A6",
    amber: "#F59E0B",
    red: "#EF4444",
    purple: "#8B5CF6",
    green: "#22C55E",
    gray: "#6B7280",
  };
  const data = [4, 7, 5, 9, 6, 11, 8, 13, 10, 15];
  const w = 180;
  const h = 36;
  const max = Math.max(...data);
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => `${i * step},${h - (v / max) * (h - 4) - 2}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block w-full">
      <polyline
        points={pts}
        fill="none"
        stroke={colorMap[tone]}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
