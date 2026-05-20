"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { KpiCard, FlowDiagram, type ToneKey } from "@/components/visualization";
import {
  updateUsedPartsFlowConfig,
  createUsedPartItem,
  updateUsedPartItem,
  setUsedPartItemStatus,
  deleteUsedPartItem,
  type UsedPartsConfigRow,
  type UsedPartItemRow,
} from "@/domain/warranty";
import {
  LIFECYCLE_STAGES,
  type LifecycleRuleRow,
  type LifecycleStage,
  type LifecycleStageStats,
  type UsedPartsKpis,
} from "@/domain/parts-warranty-used-parts.constants";
import {
  upsertLifecycleRule,
  deleteLifecycleRule,
  setLifecycleRuleActive,
  type LifecycleRuleInput,
} from "@/lib/parts-warranty/used-parts-actions";

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none";
const labelClass = "text-[11px] text-[#9A9890] font-medium";

const STATUS_BADGE: Record<string, string> = {
  awaiting: "bg-[#EBF3FF] text-[#1A3A5C]",
  approved: "bg-[#EAF3DE] text-[#3B6D11]",
  shipped: "bg-[#DBEAFE] text-[#1D4ED8]",
  disposed: "bg-[#F2F2F2] text-[#6B6A68]",
  rejected: "bg-[#FDECEA] text-[#CC0000]",
};

const DAMAGE_BADGE: Record<string, string> = {
  mild: "bg-[#EAF3DE] text-[#3B6D11]",
  moderate: "bg-[#FDF3E3] text-[#854F0B]",
  severe: "bg-[#FDECEA] text-[#CC0000]",
};

const DAMAGE_OPTIONS = [
  { value: "mild", label: "🟢 輕微磨損" },
  { value: "moderate", label: "🟡 明顯損壞" },
  { value: "severe", label: "🔴 嚴重毀損" },
];

const QUICK_LINKS = [
  { label: "→ 索賠流程說明", href: "/parts/warranty/flow" },
  { label: "→ 暫存倉設定", href: "/parts/warranty/staging-warehouse" },
  { label: "→ 舊件管理介面", href: "/parts/warranty/used-parts" },
  { label: "→ 索賠費用回收", href: "/parts/warranty/cost-recovery" },
];

const TRIGGER_KEYS = [
  {
    key: "trigger_auto_reserve" as const,
    label: "RO 工單標記「保固」時，自動建立舊件入庫預約",
  },
  {
    key: "trigger_scan_inbound" as const,
    label: "掃碼確認拆下後，觸發正式入庫",
  },
  {
    key: "trigger_manual_no_serial" as const,
    label: "無序列號舊件允許人工登記（需主管核准）",
  },
  {
    key: "trigger_require_photo" as const,
    label: "入庫時強制拍照（最少 1 張）",
  },
  {
    key: "trigger_auto_barcode" as const,
    label: "自動生成舊件條碼 WR-年份-RO 號-序列",
  },
];

type Banner = { ok: boolean; msg: string } | null;

type ItemFormState = {
  mode: "create" | "edit";
  id?: string;
  barcode: string;
  item_name: string;
  item_code: string;
  ro_no: string;
  inbound_date: string;
  damage_level: string;
};

type RuleFormState = {
  mode: "create" | "edit";
  id?: string;
  stage: LifecycleStage;
  action_label: string;
  sla_days: string;
  requires_approval: boolean;
  channel: string;
  target_role: string;
  notes: string;
  is_active: boolean;
};

export function UsedPartsFlowBoard({
  config,
  items,
  rules,
  flowData,
  kpis,
  canEdit,
}: {
  config: UsedPartsConfigRow;
  items: UsedPartItemRow[];
  rules: LifecycleRuleRow[];
  flowData: LifecycleStageStats[];
  kpis: UsedPartsKpis;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [itemForm, setItemForm] = useState<ItemFormState | null>(null);
  const [ruleForm, setRuleForm] = useState<RuleFormState | null>(null);
  const [selectedStage, setSelectedStage] = useState<LifecycleStage>(
    LIFECYCLE_STAGES[0].key,
  );

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  // ---------- Lifecycle rules CRUD ----------

  function openRuleCreate(stage: LifecycleStage) {
    setRuleForm({
      mode: "create",
      stage,
      action_label: "",
      sla_days: "",
      requires_approval: false,
      channel: "",
      target_role: "",
      notes: "",
      is_active: true,
    });
  }
  function openRuleEdit(r: LifecycleRuleRow) {
    setRuleForm({
      mode: "edit",
      id: r.id,
      stage: r.stage,
      action_label: r.action_label,
      sla_days: r.sla_days != null ? String(r.sla_days) : "",
      requires_approval: r.requires_approval,
      channel: r.channel ?? "",
      target_role: r.target_role ?? "",
      notes: r.notes ?? "",
      is_active: r.is_active,
    });
  }
  function submitRule() {
    if (!ruleForm) return;
    const slaParsed =
      ruleForm.sla_days.trim() === ""
        ? null
        : Number(ruleForm.sla_days);
    if (slaParsed != null && (Number.isNaN(slaParsed) || slaParsed < 0)) {
      showBanner({ ok: false, msg: "SLA 天數需為 ≥ 0 的整數" });
      return;
    }
    const payload: LifecycleRuleInput & { id?: string } = {
      id: ruleForm.id,
      stage: ruleForm.stage,
      action_label: ruleForm.action_label,
      sla_days: slaParsed,
      requires_approval: ruleForm.requires_approval,
      channel: ruleForm.channel,
      target_role: ruleForm.target_role,
      notes: ruleForm.notes,
      is_active: ruleForm.is_active,
    };
    startTransition(async () => {
      const res = await upsertLifecycleRule(payload);
      if (res.ok) {
        showBanner({
          ok: true,
          msg: ruleForm.mode === "create" ? "✓ 已新增規則" : "✓ 已更新規則",
        });
        setRuleForm(null);
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }
  function removeRule(r: LifecycleRuleRow) {
    if (!confirm(`刪除規則「${r.action_label}」？`)) return;
    startTransition(async () => {
      const res = await deleteLifecycleRule(r.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除規則" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }
  function toggleRule(r: LifecycleRuleRow) {
    startTransition(async () => {
      const res = await setLifecycleRuleActive(r.id, !r.is_active);
      if (res.ok) {
        showBanner({
          ok: true,
          msg: r.is_active ? "✓ 已停用規則" : "✓ 已啟用規則",
        });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  // ---------- existing config + items ----------

  const updateCfg = (patch: Record<string, unknown>) => {
    if (!canEdit) return;
    startTransition(async () => {
      const res = await updateUsedPartsFlowConfig(patch);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存設定" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const setStatus = (
    id: string,
    status: string,
    label: string,
    barcode: string,
  ) => {
    startTransition(async () => {
      const res = await setUsedPartItemStatus(id, status, label);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ ${barcode} → ${label}` });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  function openItemCreate() {
    setItemForm({
      mode: "create",
      barcode: "",
      item_name: "",
      item_code: "",
      ro_no: "",
      inbound_date: new Date().toISOString().slice(0, 10),
      damage_level: "mild",
    });
  }
  function openItemEdit(r: UsedPartItemRow) {
    setItemForm({
      mode: "edit",
      id: r.id,
      barcode: r.barcode,
      item_name: r.item_name,
      item_code: r.item_code ?? "",
      ro_no: r.ro_no ?? "",
      inbound_date: r.inbound_date ?? "",
      damage_level: r.damage_level,
    });
  }
  function submitItem() {
    if (!itemForm) return;
    const dmg = DAMAGE_OPTIONS.find((d) => d.value === itemForm.damage_level);
    startTransition(async () => {
      const payload = {
        barcode: itemForm.barcode,
        item_name: itemForm.item_name,
        item_code: itemForm.item_code,
        ro_no: itemForm.ro_no,
        inbound_date: itemForm.inbound_date || null,
        damage_level: itemForm.damage_level,
        damage_label: dmg?.label ?? null,
      };
      const res =
        itemForm.mode === "create"
          ? await createUsedPartItem(payload)
          : await updateUsedPartItem(itemForm.id!, payload);
      if (res.ok) {
        showBanner({
          ok: true,
          msg: itemForm.mode === "create" ? "✓ 已建立舊件" : "✓ 已更新舊件",
        });
        setItemForm(null);
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  }
  function removeItem(r: UsedPartItemRow) {
    if (!confirm(`刪除舊件「${r.barcode} - ${r.item_name}」？`)) return;
    startTransition(async () => {
      const res = await deleteUsedPartItem(r.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除舊件" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  }

  const itemColumns = useMemo<DataGridColumn<UsedPartItemRow>[]>(
    () => [
      {
        id: "barcode",
        header: "舊件條碼",
        width: 160,
        hideable: false,
        cell: (r) => (
          <span className="font-mono font-semibold text-[#1A3A5C]">
            {r.barcode}
          </span>
        ),
        exportValue: (r) => r.barcode,
        sortValue: (r) => r.barcode,
      },
      {
        id: "item",
        header: "品名 / 料號",
        width: 240,
        cell: (r) => (
          <div className="flex flex-col">
            <span className="text-[12.5px] text-[#2C2C2A]">{r.item_name}</span>
            <span className="text-[11px] text-[#9A9890] font-mono">
              {r.item_code ?? "—"}
            </span>
          </div>
        ),
        exportValue: (r) => `${r.item_name} / ${r.item_code ?? ""}`,
        sortValue: (r) => r.item_name,
      },
      {
        id: "ro_no",
        header: "RO 工單",
        width: 130,
        cell: (r) => (
          <span className="font-mono text-[12.5px] text-[#5A5955]">
            {r.ro_no ?? "—"}
          </span>
        ),
        exportValue: (r) => r.ro_no ?? "",
        sortValue: (r) => r.ro_no ?? "",
      },
      {
        id: "inbound_date",
        header: "入庫日",
        width: 110,
        cell: (r) => r.inbound_date ?? "—",
        exportValue: (r) => r.inbound_date ?? "",
        sortValue: (r) => r.inbound_date ?? "",
      },
      {
        id: "damage",
        header: "損壞等級",
        width: 110,
        cell: (r) => (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${
              DAMAGE_BADGE[r.damage_level] ?? DAMAGE_BADGE.mild
            }`}
          >
            {r.damage_label ?? r.damage_level}
          </span>
        ),
        exportValue: (r) => r.damage_label ?? r.damage_level,
        sortValue: (r) => r.damage_level,
      },
      {
        id: "status",
        header: "目前狀態",
        width: 130,
        cell: (r) => (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${
              STATUS_BADGE[r.status] ?? STATUS_BADGE.awaiting
            }`}
          >
            {r.status_label ?? r.status}
          </span>
        ),
        exportValue: (r) => r.status_label ?? r.status,
        sortValue: (r) => r.status,
      },
    ],
    [],
  );

  // ---------- FlowDiagram data ----------

  const flowNodes = useMemo(
    () =>
      flowData.map((s) => ({
        id: s.stage,
        label: `${s.label}・${s.count}件`,
        tone: s.tone as ToneKey,
      })),
    [flowData],
  );

  const flowEdges = useMemo(() => {
    const edges: { from: string; to: string; label?: string }[] = [];
    // 主鏈：removed → staged → under_review → return_to_oem
    edges.push({ from: "removed", to: "staged" });
    edges.push({ from: "staged", to: "under_review" });
    edges.push({ from: "under_review", to: "return_to_oem", label: "核准" });
    // 分支：under_review → destroyed / recycled
    edges.push({ from: "under_review", to: "destroyed", label: "銷毀" });
    edges.push({ from: "under_review", to: "recycled", label: "拒絕" });
    return edges;
  }, []);

  const selectedStageMeta = LIFECYCLE_STAGES.find(
    (s) => s.key === selectedStage,
  );
  const selectedStageStat = flowData.find((s) => s.stage === selectedStage);
  const rulesForStage = rules.filter((r) => r.stage === selectedStage);

  const isEmptyRules = rules.length === 0;

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">
          舊件出入庫邏輯
        </h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          M04L-12
        </span>
        <span className="text-[12px] text-[#9A9890]">
          保固索賠舊件生命週期 · 每階段處理規則 / SLA / 通知設定
        </span>
      </header>

      {banner ? (
        <div
          data-testid="used-parts-flow-banner"
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <KpiCard
          label="舊件總件數"
          value={kpis.totalItems}
          tone="blue"
          layout="horizontal"
        />
        <KpiCard
          label="暫存中（待原廠審核）"
          value={kpis.staged}
          tone="teal"
          layout="horizontal"
        />
        <KpiCard
          label="待退原廠（已核准）"
          value={kpis.awaitingOem}
          tone="amber"
          layout="horizontal"
        />
        <KpiCard
          label="已銷毀"
          value={kpis.destroyed}
          tone="red"
          layout="horizontal"
        />
      </div>

      {/* Flow diagram + Rule panel — 2 col */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <section
          className={`lg:col-span-2 bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${lockedClass}`}
          data-testid="lifecycle-flow"
        >
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
            <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
              🔁 舊件生命週期流程
            </h2>
            <span className="text-[11px] text-[#9A9890]">
              點節點切換右側規則設定
            </span>
          </header>
          <div className="px-3 py-3 overflow-x-auto">
            <FlowDiagram
              nodes={flowNodes}
              edges={flowEdges}
              currentNodeId={selectedStage}
            />
            {/* clickable hot-strip：在 SVG 下方放一排 button 對齊節點 */}
            <div className="mt-2 flex gap-2 flex-wrap">
              {LIFECYCLE_STAGES.map((stg) => {
                const stat = flowData.find((s) => s.stage === stg.key);
                const isCurrent = selectedStage === stg.key;
                return (
                  <button
                    key={stg.key}
                    type="button"
                    data-testid={`stage-pill-${stg.key}`}
                    onClick={() => setSelectedStage(stg.key)}
                    className={`px-2.5 h-[26px] rounded-full text-[11.5px] border ${
                      isCurrent
                        ? "bg-[#1A3A5C] text-white border-[#1A3A5C]"
                        : "bg-white text-[#5A5955] border-[#D5D3CB] hover:border-[#9A9890]"
                    }`}
                  >
                    {stg.label}（{stat?.count ?? 0}件・平均{" "}
                    {stat?.avgStayDays != null ? `${stat.avgStayDays}天` : "—"}）
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Right rule panel */}
        <aside
          className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${lockedClass}`}
          data-testid="lifecycle-rule-panel"
        >
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between gap-2">
            <div className="flex flex-col min-w-0">
              <span className="text-[11px] text-[#9A9890]">階段</span>
              <span className="text-[13px] font-semibold text-[#2C2C2A] truncate">
                {selectedStageMeta?.label ?? selectedStage}
              </span>
            </div>
            <button
              type="button"
              data-testid="rule-create-open"
              disabled={!canEdit || isPending}
              onClick={() => openRuleCreate(selectedStage)}
              className="h-[26px] px-2.5 rounded text-[11.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
            >
              ＋ 新增規則
            </button>
          </header>
          <div className="p-3 space-y-2 max-h-[480px] overflow-y-auto">
            {selectedStageStat ? (
              <div className="flex flex-wrap gap-2 text-[11.5px] text-[#5A5955] px-1">
                <span>件數：{selectedStageStat.count}</span>
                <span>·</span>
                <span>
                  平均停留：
                  {selectedStageStat.avgStayDays != null
                    ? `${selectedStageStat.avgStayDays} 天`
                    : "—"}
                </span>
                <span>·</span>
                <span>
                  規則：{selectedStageStat.rulesActive}/
                  {selectedStageStat.rulesTotal} 啟用
                </span>
              </div>
            ) : null}
            {rulesForStage.length === 0 ? (
              <div
                data-testid="rule-empty"
                className="px-3 py-6 text-center text-[12px] text-[#9A9890] border border-dashed border-[#D5D3CB] rounded"
              >
                此階段尚無規則，點上方「＋ 新增規則」建立。
              </div>
            ) : (
              rulesForStage.map((r) => (
                <div
                  key={r.id}
                  data-testid={`rule-row-${r.id}`}
                  className={`px-3 py-2 rounded border ${
                    r.is_active
                      ? "border-[#EEECE6] bg-white"
                      : "border-[#EEECE6] bg-[#F8F7F4] opacity-70"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] text-[#2C2C2A] font-medium">
                        {r.action_label}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {r.sla_days != null ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF4FB] text-[#185FA5] whitespace-nowrap">
                            SLA {r.sla_days} 天
                          </span>
                        ) : null}
                        {r.requires_approval ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B] whitespace-nowrap">
                            需主管核准
                          </span>
                        ) : null}
                        {r.channel ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EBF3FF] text-[#1A3A5C] whitespace-nowrap">
                            通道：{r.channel}
                          </span>
                        ) : null}
                        {r.target_role ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF3DE] text-[#3B6D11] whitespace-nowrap">
                            對象：{r.target_role}
                          </span>
                        ) : null}
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${
                            r.is_active
                              ? "bg-[#EAF3DE] text-[#3B6D11]"
                              : "bg-[#F2F2F2] text-[#6B6A68]"
                          }`}
                        >
                          {r.is_active ? "啟用" : "停用"}
                        </span>
                      </div>
                      {r.notes ? (
                        <div className="text-[11.5px] text-[#5A5955] mt-1">
                          {r.notes}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-2 flex justify-end gap-1.5">
                    <button
                      type="button"
                      data-testid={`rule-toggle-${r.id}`}
                      disabled={!canEdit || isPending}
                      onClick={() => toggleRule(r)}
                      className="h-[24px] px-2 rounded text-[11px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                    >
                      {r.is_active ? "停用" : "啟用"}
                    </button>
                    <button
                      type="button"
                      data-testid={`rule-edit-${r.id}`}
                      disabled={!canEdit || isPending}
                      onClick={() => openRuleEdit(r)}
                      className="h-[24px] px-2 rounded text-[11px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                    >
                      編輯
                    </button>
                    <button
                      type="button"
                      data-testid={`rule-delete-${r.id}`}
                      disabled={!canEdit || isPending}
                      onClick={() => removeRule(r)}
                      className="h-[24px] px-2 rounded text-[11px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
                    >
                      刪除
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>

      {isEmptyRules ? (
        <div className="px-3 py-2 rounded bg-[#FDF3E3] border border-[#F4DDA1] text-[12px] text-[#854F0B]">
          ⚠️ 尚未設定任何生命週期規則，請依各階段補上 SLA、通知通道與主管核准規則。
        </div>
      ) : null}

      {/* 既有：config + 在途列表（次要） */}
      <div className="px-3 py-2 rounded bg-[#EBF3FF] border border-[#B5D4F4] text-[12px] text-[#1A3A5C]">
        📦 以下為入/出庫觸發條件設定與在途追蹤；規則設定（SLA / 通知）走上方流程圖面板。
      </div>

      <div className={`grid grid-cols-1 lg:grid-cols-2 gap-3 ${lockedClass}`}>
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
              ⚙️ 舊件入庫邏輯設定
            </h2>
          </header>
          <div className="px-4 py-3 space-y-3">
            <div className={labelClass}>觸發條件</div>
            <div className="space-y-1">
              {TRIGGER_KEYS.map((t) => (
                <label
                  key={t.key}
                  className="flex items-center gap-2 text-[12.5px] text-[#2C2C2A]"
                >
                  <input
                    type="checkbox"
                    data-testid={`trigger-${t.key}`}
                    disabled={!canEdit || isPending}
                    checked={Boolean(config[t.key])}
                    onChange={(e) =>
                      updateCfg({ [t.key]: e.target.checked })
                    }
                  />
                  {t.label}
                </label>
              ))}
            </div>
            <div className="flex flex-col gap-1 pt-1">
              <label className={labelClass}>入庫目標倉庫</label>
              <select
                data-testid="inbound-warehouse"
                disabled={!canEdit || isPending}
                value={config.inbound_warehouse}
                onChange={(e) =>
                  updateCfg({ inbound_warehouse: e.target.value })
                }
                className={inputClass}
              >
                <option value="warranty_staging">保固暫存倉（預設）</option>
                <option value="store_local">各門店暫存區</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>損壞等級標記（必填）</label>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {DAMAGE_OPTIONS.map((d) => (
                  <span
                    key={d.value}
                    className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${
                      DAMAGE_BADGE[d.value] ?? DAMAGE_BADGE.mild
                    }`}
                  >
                    {d.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
              📤 舊件出庫邏輯設定
            </h2>
          </header>
          <div className="px-4 py-3 space-y-3">
            <div className={labelClass}>出庫觸發條件（依場景擇一）</div>
            <div className="space-y-1.5">
              <div className="px-3 py-2 rounded border border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between text-[12.5px]">
                <span>🚚 寄回原廠：原廠核准後，產生出庫單 + 物流標籤</span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF4FB] text-[#185FA5] whitespace-nowrap">
                  主要
                </span>
              </div>
              <div className="px-3 py-2 rounded border border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between text-[12.5px]">
                <span>🗑 就地銷毀：原廠指示銷毀，上傳銷毀證明後出庫</span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#6B6A68] whitespace-nowrap">
                  次要
                </span>
              </div>
              <div className="px-3 py-2 rounded border border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between text-[12.5px]">
                <span>❌ 索賠拒絕：原廠拒絕，轉入廢品倉或退還客戶</span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDECEA] text-[#CC0000] whitespace-nowrap">
                  例外
                </span>
              </div>
            </div>
            <div className={labelClass}>自動化設定</div>
            <label className="flex items-center gap-2 text-[12.5px] text-[#2C2C2A]">
              <input
                type="checkbox"
                data-testid="auto-update-claim"
                disabled={!canEdit || isPending}
                checked={config.auto_update_claim}
                onChange={(e) =>
                  updateCfg({ auto_update_claim: e.target.checked })
                }
              />
              出庫後自動更新索賠單狀態為「舊件已處置」
            </label>
            <label className="flex items-center gap-2 text-[12.5px] text-[#2C2C2A]">
              <input
                type="checkbox"
                data-testid="auto-link-cost-recovery"
                disabled={!canEdit || isPending}
                checked={config.auto_link_cost_recovery}
                onChange={(e) =>
                  updateCfg({ auto_link_cost_recovery: e.target.checked })
                }
              />
              連動費用回收：出庫後進入「待收款」狀態
            </label>
          </div>
        </section>
      </div>

      <section
        className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${lockedClass}`}
      >
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
            📋 舊件在途狀態查詢（{items.length}）
          </h2>
          <button
            type="button"
            data-testid="item-create-open"
            disabled={!canEdit || isPending}
            onClick={openItemCreate}
            className="h-[26px] px-3 rounded text-[11.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
          >
            ＋ 新增舊件
          </button>
        </header>
        <div className="p-3">
          <DataGrid
            columns={itemColumns}
            data={items}
            rowKey={(r) => r.id}
            persistKey="parts/warranty/used-parts-flow/items"
            exportFileName="used-parts-flow-items"
            emptyMessage="尚無在途舊件"
            disabled={isPending}
            rowActionsWidth={240}
            rowActions={(r) => (
              <>
                {r.status === "awaiting" ? (
                  <button
                    type="button"
                    data-testid={`approve-${r.id}`}
                    disabled={!canEdit}
                    onClick={() =>
                      setStatus(r.id, "approved", "核准-待寄回", r.barcode)
                    }
                    className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
                  >
                    核准
                  </button>
                ) : r.status === "approved" ? (
                  <button
                    type="button"
                    data-testid={`ship-${r.id}`}
                    disabled={!canEdit}
                    onClick={() =>
                      setStatus(r.id, "shipped", "已寄出", r.barcode)
                    }
                    className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50"
                  >
                    寄出
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => openItemEdit(r)}
                  className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                >
                  編輯
                </button>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => removeItem(r)}
                  className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
                >
                  刪除
                </button>
              </>
            )}
          />
        </div>
      </section>

      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
            🔗 相關頁面快速跳轉
          </h2>
        </header>
        <div className="px-3 py-3 flex gap-2 flex-wrap">
          {QUICK_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="h-[28px] px-3 inline-flex items-center rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              {l.label}
            </Link>
          ))}
        </div>
      </section>

      {/* Rule modal */}
      {ruleForm ? (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-[560px] w-full max-h-[90vh] overflow-y-auto">
            <header className="px-4 py-3 border-b border-[#EEECE6]">
              <h3 className="text-[14px] font-semibold text-[#2C2C2A]">
                {ruleForm.mode === "create" ? "新增生命週期規則" : "編輯規則"}
              </h3>
              <div className="text-[11px] text-[#9A9890] mt-0.5">
                階段：
                {LIFECYCLE_STAGES.find((s) => s.key === ruleForm.stage)?.label}
              </div>
            </header>
            <div className="px-4 py-3 space-y-3">
              <div className="flex flex-col gap-1">
                <label className={labelClass}>處理動作描述</label>
                <input
                  type="text"
                  data-testid="rule-form-label"
                  value={ruleForm.action_label}
                  onChange={(e) =>
                    setRuleForm({ ...ruleForm, action_label: e.target.value })
                  }
                  placeholder="例：原廠審讀照片＋索賠單"
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>SLA 天數（留空=不設）</label>
                  <input
                    type="number"
                    min={0}
                    value={ruleForm.sla_days}
                    onChange={(e) =>
                      setRuleForm({ ...ruleForm, sla_days: e.target.value })
                    }
                    className={inputClass}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>通知通道</label>
                  <input
                    type="text"
                    value={ruleForm.channel}
                    onChange={(e) =>
                      setRuleForm({ ...ruleForm, channel: e.target.value })
                    }
                    placeholder="LINE / Email / system"
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>對象角色</label>
                  <input
                    type="text"
                    value={ruleForm.target_role}
                    onChange={(e) =>
                      setRuleForm({ ...ruleForm, target_role: e.target.value })
                    }
                    placeholder="parts_clerk / warranty_manager"
                    className={inputClass}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>需要主管核准</label>
                  <label className="flex items-center gap-2 text-[12.5px] text-[#2C2C2A] h-[30px]">
                    <input
                      type="checkbox"
                      checked={ruleForm.requires_approval}
                      onChange={(e) =>
                        setRuleForm({
                          ...ruleForm,
                          requires_approval: e.target.checked,
                        })
                      }
                    />
                    開啟後此規則需主管雙簽
                  </label>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>備註</label>
                <textarea
                  rows={2}
                  value={ruleForm.notes}
                  onChange={(e) =>
                    setRuleForm({ ...ruleForm, notes: e.target.value })
                  }
                  className="border border-[#D5D3CB] rounded px-2 py-1 text-[12.5px] focus:border-[#185FA5] outline-none"
                />
              </div>
              <label className="flex items-center gap-2 text-[12.5px] text-[#2C2C2A]">
                <input
                  type="checkbox"
                  checked={ruleForm.is_active}
                  onChange={(e) =>
                    setRuleForm({ ...ruleForm, is_active: e.target.checked })
                  }
                />
                建立後立即啟用
              </label>
            </div>
            <footer className="px-4 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={() => setRuleForm(null)}
                className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                type="button"
                data-testid="rule-form-submit"
                disabled={isPending}
                onClick={submitRule}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
              >
                {isPending
                  ? ruleForm.mode === "create"
                    ? "建立中⋯"
                    : "儲存中⋯"
                  : ruleForm.mode === "create"
                    ? "建立規則"
                    : "儲存變更"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {/* Item modal */}
      {itemForm ? (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-[520px] w-full max-h-[90vh] overflow-y-auto">
            <header className="px-4 py-3 border-b border-[#EEECE6]">
              <h3 className="text-[14px] font-semibold text-[#2C2C2A]">
                {itemForm.mode === "create" ? "新增舊件" : "編輯舊件"}
              </h3>
            </header>
            <div className="px-4 py-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>舊件條碼</label>
                  <input
                    data-testid="item-form-barcode"
                    type="text"
                    value={itemForm.barcode}
                    onChange={(e) =>
                      setItemForm({ ...itemForm, barcode: e.target.value })
                    }
                    className={`${inputClass} font-mono`}
                    placeholder="WR-2026-RO123-01"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>RO 工單</label>
                  <input
                    type="text"
                    value={itemForm.ro_no}
                    onChange={(e) =>
                      setItemForm({ ...itemForm, ro_no: e.target.value })
                    }
                    className={`${inputClass} font-mono`}
                    placeholder="RO-2026-001"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>品名</label>
                <input
                  data-testid="item-form-name"
                  type="text"
                  value={itemForm.item_name}
                  onChange={(e) =>
                    setItemForm({ ...itemForm, item_name: e.target.value })
                  }
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>料號</label>
                  <input
                    type="text"
                    value={itemForm.item_code}
                    onChange={(e) =>
                      setItemForm({ ...itemForm, item_code: e.target.value })
                    }
                    className={`${inputClass} font-mono`}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>入庫日</label>
                  <input
                    type="date"
                    value={itemForm.inbound_date}
                    onChange={(e) =>
                      setItemForm({
                        ...itemForm,
                        inbound_date: e.target.value,
                      })
                    }
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>損壞等級</label>
                <select
                  data-testid="item-form-damage"
                  value={itemForm.damage_level}
                  onChange={(e) =>
                    setItemForm({ ...itemForm, damage_level: e.target.value })
                  }
                  className={inputClass}
                >
                  {DAMAGE_OPTIONS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <footer className="px-4 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={() => setItemForm(null)}
                className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                type="button"
                data-testid="item-form-submit"
                disabled={isPending}
                onClick={submitItem}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
              >
                {isPending
                  ? itemForm.mode === "create"
                    ? "建立中⋯"
                    : "儲存中⋯"
                  : itemForm.mode === "create"
                    ? "建立"
                    : "儲存"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </main>
  );
}
