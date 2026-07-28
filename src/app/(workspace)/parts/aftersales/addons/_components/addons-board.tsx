"use client";

/**
 * 追加項目記錄 — A 級（M03-4 / 第十輪 BDN）
 *
 * 升級點：
 *  1. 4 顆標準 <KpiCard tone vertical icon delta>（待確認 / 同意 / 拒絕 / 同意金額）
 *  2. <DonutChart> 決策分佈 + <FunnelChart> 「提議 → 確認 → 同意 → 寫工單」漏斗
 *  3. 視圖切換：list（DataGrid）/ kanban（拖曳改決策樂觀更新）/ followup（待追蹤閉環）
 *  4. detail page 連結（/parts/aftersales/addons/[id]）
 *  5. 樂觀更新（useOptimistic）+ pending 鎖 UI
 *
 * 注意：cancelled 只在 list 視圖看得到（kanban 不放，會塞）。
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, useOptimistic } from "react";

import { useSetPageHeader } from "@/components/page-header-context";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import {
  KpiCard,
  KanbanBoard,
  type KanbanCard,
  type KanbanColumn,
} from "@/components/visualization";
import { DonutChart, FunnelChart, type DonutDatum, type FunnelDatum } from "@/components/charts";
import {
  ADDON_KANBAN_COLUMNS,
  CONFIRM_LABEL,
  DECISION_CHIP,
  DECISION_DONUT_COLOR,
  DECISION_LABEL,
  REJECTION_REASON_OPTIONS,
  SAFETY_CHIP,
  SAFETY_LABEL,
  TYPE_LABEL,
  isCustomerSupplied,
  type AddonsListFilter,
  type AddonsSummary,
  type CustomerDecision,
  type RejectionReason,
  type RepairOrderAddonWithRo,
  type RoOptionForAddons,
  type SafetyLevel,
} from "@/domain/repair-order-addons.constants";
import {
  cancelAddonAction,
  createAddonAction,
  decideAddonAction,
  type AddonInput,
  type ConfirmMethod,
} from "@/lib/aftersales/repair-order-addon-actions";
import type { AddonCostSummary } from "@/domain/repair-order-addons.constants";

type Banner = { ok: boolean; msg: string } | null;
type ViewMode = "list" | "kanban" | "followup";

// 純算數格式化 Asia/Taipei wall-clock（避開 toLocaleString 在 Node ICU / browser ICU
// 對 dayPeriod / narrow nbsp 不一致造成的 SSR / CSR hydration mismatch）
function fmtTaipeiMonthDayTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const d = new Date(t + 8 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
function fmtTaipeiDateTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const d = new Date(t + 8 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function AddonsBoard({
  rows,
  summary,
  filter,
  canEdit,
  roOptions,
  costSummary,
}: {
  rows: RepairOrderAddonWithRo[];
  summary: AddonsSummary;
  filter: AddonsListFilter;
  canEdit: boolean;
  roOptions: RoOptionForAddons[];
  /** 費用摘要 — 有 roId filter 時由 page.tsx 傳入；無 filter 時為 null */
  costSummary: AddonCostSummary | null;
}) {
  useSetPageHeader({
    title: "追加項目記錄",
    breadcrumb: [
      { label: "售後修護", href: "/parts/aftersales" },
      { label: "追加項目記錄" },
    ],
    hideSearch: true,
  });

  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [decideTarget, setDecideTarget] = useState<RepairOrderAddonWithRo | null>(null);
  const [creating, setCreating] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  // 樂觀更新 customer_decision — 拖曳 Kanban / 快速決策用
  const [optimisticRows, applyOptimistic] = useOptimistic(
    rows,
    (state, action: { id: string; decision: CustomerDecision }) =>
      state.map((r) =>
        r.id === action.id ? { ...r, customer_decision: action.decision } : r,
      ),
  );

  // filter inputs（local state，按「查詢」才推 URL）
  const [decisionLocal, setDecisionLocal] = useState<CustomerDecision | "all">(
    (filter.decision as CustomerDecision | "all" | undefined) ?? "all",
  );
  const [safetyLocal, setSafetyLocal] = useState<SafetyLevel | "all">(
    (filter.safetyLevel as SafetyLevel | "all" | undefined) ?? "all",
  );
  const [roIdLocal, setRoIdLocal] = useState(filter.roId ?? "");
  const [qLocal, setQLocal] = useState(filter.q ?? "");

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const submitFilter = () => {
    const sp = new URLSearchParams();
    if (decisionLocal && decisionLocal !== "all") sp.set("decision", String(decisionLocal));
    if (safetyLocal && safetyLocal !== "all") sp.set("safety", String(safetyLocal));
    if (roIdLocal) sp.set("ro_id", roIdLocal);
    if (qLocal) sp.set("q", qLocal);
    startTransition(() => router.push(`/parts/aftersales/addons?${sp.toString()}`));
  };

  const resetFilter = () => {
    setDecisionLocal("all");
    setSafetyLocal("all");
    setRoIdLocal("");
    setQLocal("");
    startTransition(() => router.push("/parts/aftersales/addons"));
  };

  const handleCancel = (id: string) => {
    if (!confirm("確認取消此追加項目？只有待確認的可取消。")) return;
    startTransition(async () => {
      applyOptimistic({ id, decision: "cancelled" });
      const r = await cancelAddonAction(id);
      if (r.ok) {
        showBanner({ ok: true, msg: "✓ 已取消" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: r.error });
        router.refresh();
      }
    });
  };

  // Kanban 拖曳：fromColumn = 原 decision, toColumn = 目標 decision
  // 規則：只有 pending → {agreed/deferred/rejected} 透過 decide flow（會寫 ro_lines）
  //        其他組合都禁止（避免亂改已決策的資料）
  const handleKanbanMove = (
    cardId: string,
    fromColumn: string,
    toColumn: string,
  ) => {
    if (fromColumn === toColumn) return;
    if (!canEdit) {
      showBanner({ ok: false, msg: "無編輯權限" });
      return;
    }
    if (fromColumn !== "pending") {
      showBanner({ ok: false, msg: "已決策的追加項目不能改用拖曳，請從詳情頁處理" });
      return;
    }
    if (!["agreed", "deferred", "rejected"].includes(toColumn)) {
      showBanner({ ok: false, msg: "目標欄位不合法" });
      return;
    }

    // pending → agreed 走完整 decide flow，confirm_method 必填
    // 為避免 kanban 上沒有 modal 選擇，這裡開 decideTarget 讓使用者選確認方式
    const target = optimisticRows.find((r) => r.id === cardId);
    if (target) setDecideTarget(target);
  };

  // ── KPI 數據（從 summary 來，沒有 delta — 沒歷史比較資料）
  const kpiPending = summary.pending;
  const kpiAgreed = summary.agreed;
  const kpiRejected = summary.rejected + summary.cancelled;
  const kpiAgreedAmt = summary.agreedAmount;
  const kpiFollowup = summary.followupNeeded;

  // ── DonutChart：決策分佈
  const decisionDistribution = useMemo<DonutDatum[]>(() => {
    const counts: Record<CustomerDecision, number> = {
      pending: 0,
      agreed: 0,
      deferred: 0,
      rejected: 0,
      cancelled: 0,
    };
    for (const r of optimisticRows) counts[r.customer_decision] += 1;
    const out: DonutDatum[] = [];
    (Object.keys(counts) as CustomerDecision[]).forEach((k) => {
      if (counts[k] > 0)
        out.push({
          name: DECISION_LABEL[k],
          value: counts[k],
          color: DECISION_DONUT_COLOR[k],
        });
    });
    return out;
  }, [optimisticRows]);

  // ── FunnelChart：「提議 → 已確認(non-pending) → 同意 → 已寫工單」
  const funnelData = useMemo<FunnelDatum[]>(() => {
    const total = optimisticRows.length;
    const confirmed = optimisticRows.filter((r) => r.customer_decision !== "pending").length;
    const agreed = optimisticRows.filter((r) => r.customer_decision === "agreed").length;
    const reserved = optimisticRows.filter(
      (r) => r.customer_decision === "agreed" && r.reserved_at,
    ).length;
    return [
      { name: "技師提議", value: total, color: "#9A9890" },
      { name: "車主已回覆", value: confirmed, color: "#F59E0B" },
      { name: "同意執行", value: agreed, color: "#22C55E" },
      { name: "已寫進工單", value: reserved, color: "#0F6E56" },
    ];
  }, [optimisticRows]);

  // ── Kanban cards / columns
  const kanbanCards = useMemo<KanbanCard[]>(() => {
    return optimisticRows
      .filter((r) => r.customer_decision !== "cancelled")
      .map((r) => ({
        id: r.id,
        columnId: r.customer_decision,
        content: <KanbanCardBody row={r} />,
      }));
  }, [optimisticRows]);

  const kanbanColumns = useMemo<KanbanColumn[]>(
    () =>
      ADDON_KANBAN_COLUMNS.map((c) => ({
        id: c.id,
        title: c.title,
        tone: c.tone,
      })),
    [],
  );

  // ── 待追蹤 closeloop 視圖：只看 requires_followup 的 row
  const followupRows = useMemo(() => {
    return optimisticRows.filter((r) => {
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      return Boolean(meta.requires_followup);
    });
  }, [optimisticRows]);

  const columns: DataGridColumn<RepairOrderAddonWithRo>[] = useMemo(
    () => [
      {
        id: "ro",
        header: "工單",
        width: 160,
        hideable: false,
        cell: (r) => (
          <div className="flex flex-col gap-0.5">
            <span className="font-mono font-semibold text-[#1A3A5C] text-[12px]">
              {r.ro?.ro_code ?? "—"}
            </span>
            <span className="text-[11px] text-[#9A9890]">
              {r.ro?.customer_name ?? ""} {r.ro?.vehicle_license_plate ?? ""}
            </span>
          </div>
        ),
        exportValue: (r) => r.ro?.ro_code ?? "",
        sortValue: (r) => r.ro?.ro_code ?? "",
      },
      {
        id: "addon_no",
        header: "#",
        width: 50,
        cell: (r) => <span className="font-mono text-[#5A5955]">#{r.addon_no}</span>,
        exportValue: (r) => `#${r.addon_no}`,
        sortValue: (r) => r.addon_no,
      },
      {
        id: "name",
        header: "項目名稱",
        width: 220,
        cell: (r) => (
          <Link
            href={`/parts/aftersales/addons/${r.id}`}
            className="flex flex-col hover:text-[#185FA5]"
          >
            <span className="text-[#2C2C2A] hover:text-[#185FA5] inline-flex items-center gap-1.5">
              {r.name}
              {isCustomerSupplied(r.metadata) && (
                <span
                  className="px-1.5 py-0.5 rounded-md text-[10.5px] bg-[#EAF4FB] text-[#185FA5] whitespace-nowrap"
                  title="客戶自帶零件，不執行庫存出庫"
                >
                  客戶自備
                </span>
              )}
            </span>
            {r.tech_reason && (
              <span className="text-[11px] text-[#9A9890] line-clamp-1">{r.tech_reason}</span>
            )}
          </Link>
        ),
        exportValue: (r) => r.name,
      },
      {
        id: "addon_type",
        header: "類型",
        width: 90,
        cell: (r) => (
          <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF4FB] text-[#185FA5]">
            {TYPE_LABEL[r.addon_type]}
          </span>
        ),
        exportValue: (r) => TYPE_LABEL[r.addon_type],
      },
      {
        id: "safety_level",
        header: "安全等級",
        width: 120,
        cell: (r) => (
          <span
            className={`px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${SAFETY_CHIP[r.safety_level]}`}
          >
            {SAFETY_LABEL[r.safety_level]}
          </span>
        ),
        exportValue: (r) => SAFETY_LABEL[r.safety_level],
      },
      {
        id: "estimated_fee",
        header: "估計費用",
        width: 100,
        align: "right",
        cell: (r) => (
          <span className="font-mono text-[#2C2C2A]">
            NT$ {Number(r.estimated_fee).toLocaleString()}
          </span>
        ),
        exportValue: (r) => Number(r.estimated_fee),
        sortValue: (r) => Number(r.estimated_fee),
      },
      {
        id: "confirm_method",
        header: "確認方式",
        width: 90,
        cell: (r) =>
          r.confirm_method ? (
            <span className="text-[11.5px] text-[#5A5955]">{CONFIRM_LABEL[r.confirm_method]}</span>
          ) : (
            <span className="text-[11.5px] text-[#9A9890]">—</span>
          ),
        exportValue: (r) => (r.confirm_method ? CONFIRM_LABEL[r.confirm_method] : ""),
      },
      {
        id: "customer_decision",
        header: "決策",
        width: 90,
        cell: (r) => (
          <span
            className={`px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${DECISION_CHIP[r.customer_decision]}`}
          >
            {DECISION_LABEL[r.customer_decision]}
          </span>
        ),
        exportValue: (r) => DECISION_LABEL[r.customer_decision],
      },
      {
        id: "followup",
        header: "閉環",
        width: 70,
        sortable: false,
        cell: (r) => {
          const meta = (r.metadata ?? {}) as Record<string, unknown>;
          return meta.requires_followup ? (
            <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDECEA] text-[#CC0000]">
              待追蹤
            </span>
          ) : (
            <span className="text-[11px] text-[#9A9890]">—</span>
          );
        },
        exportValue: (r) =>
          ((r.metadata ?? {}) as Record<string, unknown>).requires_followup ? "待追蹤" : "",
      },
      {
        id: "proposed_at",
        header: "提議時間",
        width: 130,
        cell: (r) => (
          <span className="text-[11.5px] text-[#5A5955]">
            {fmtTaipeiMonthDayTime(r.proposed_at)}
          </span>
        ),
        exportValue: (r) => fmtTaipeiDateTime(r.proposed_at),
        sortValue: (r) => new Date(r.proposed_at).getTime(),
      },
    ],
    [],
  );

  const sprintCaption =
    summary.total === 0
      ? "技師發現 → 車主決策 → 同意寫進 RO，拒絕/暫緩+安全 → 增項閉環"
      : `共 ${summary.total} 筆 · 待確認 ${summary.pending} · 同意 ${summary.agreed} · 待追蹤 ${summary.followupNeeded}`;

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">追加項目記錄</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          M03-4 · A 級
        </span>
        <span className="text-[12px] text-[#9A9890]">{sprintCaption}</span>
      </header>

      {/* Info Banner — 說明系統行為：同意→預留庫存 / 拒絕→增項閉環 */}
      <div className="flex items-center gap-3 bg-[#EAF4FB] border border-[#B8D9EF] rounded-lg px-4 py-2.5">
        <span className="material-symbols-outlined text-[18px] text-[#185FA5] flex-shrink-0">info</span>
        <p className="text-[12px] text-[#185FA5] flex-1">
          <span className="font-medium">同意</span>：自動預留庫存 + 寫入工單明細
          <span className="mx-2 text-[#9A9890]">｜</span>
          <span className="font-medium">拒絕/暫緩 + 安全等級</span>：進入增項閉環追蹤
        </p>
        <Link
          href="/parts/issue/repair-pick"
          className="h-[26px] px-3 rounded text-[11.5px] font-medium bg-[#185FA5] text-white hover:bg-[#1252A0] whitespace-nowrap inline-flex items-center gap-1 flex-shrink-0"
        >
          <span className="material-symbols-outlined text-[14px]">exit_to_app</span>
          → 維修領料
        </Link>
      </div>

      {/* KPI Row — 4 顆標準 KpiCard with tone */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <KpiCard
          label="待確認"
          value={`${kpiPending} 件`}
          tone="amber"
          layout="vertical"
          icon={<span className="material-symbols-outlined text-[18px]">help</span>}
        />
        <KpiCard
          label="車主同意"
          value={`${kpiAgreed} 件`}
          tone="green"
          layout="vertical"
          icon={<span className="material-symbols-outlined text-[18px]">check_circle</span>}
        />
        <KpiCard
          label="拒絕 / 取消"
          value={`${kpiRejected} 件`}
          tone="red"
          layout="vertical"
          icon={<span className="material-symbols-outlined text-[18px]">cancel</span>}
        />
        <KpiCard
          label="同意金額"
          value={`NT$ ${kpiAgreedAmt.toLocaleString()}`}
          tone="teal"
          layout="vertical"
          icon={<span className="material-symbols-outlined text-[18px]">payments</span>}
        />
      </section>

      {/* mini KPI 列 — 補次要指標 */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <KpiCard label="暫緩" value={`${summary.deferred} 件`} tone="blue" layout="mini" />
        <KpiCard
          label="拒絕（不含取消）"
          value={`${summary.rejected} 件`}
          tone="red"
          layout="mini"
        />
        <KpiCard
          label="待追蹤閉環"
          value={`${kpiFollowup} 件`}
          tone="red"
          layout="mini"
        />
        <KpiCard
          label="拒絕損失金額"
          value={`NT$ ${summary.rejectedAmount.toLocaleString()}`}
          tone="gray"
          layout="mini"
        />
      </section>

      {/* Donut + Funnel 兩欄 */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">決策分佈</span>
          </header>
          <div className="px-4 py-3">
            {decisionDistribution.length === 0 ? (
              <p className="text-[12px] text-[#9A9890] py-12 text-center">無追加項目資料</p>
            ) : (
              <DonutChart
                data={decisionDistribution}
                size="sm"
                showLegend
                centerLabel={`${optimisticRows.length}`}
                centerCaption="項目"
              />
            )}
          </div>
        </div>

        <div className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">決策漏斗</span>
          </header>
          <div className="px-4 py-3">
            {funnelData[0].value === 0 ? (
              <p className="text-[12px] text-[#9A9890] py-12 text-center">無追加項目資料</p>
            ) : (
              <FunnelChart data={funnelData} size="sm" showLabels />
            )}
          </div>
        </div>
      </section>

      {/* Banner */}
      {banner && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      )}

      {/* Filter Bar */}
      <section
        className={`bg-white border border-[#EEECE6] rounded-lg px-4 py-3 ${isPending ? "opacity-60 pointer-events-none" : ""}`}
      >
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">決策狀態</label>
            <select
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px]"
              value={decisionLocal ?? "all"}
              onChange={(e) => setDecisionLocal(e.target.value as CustomerDecision | "all")}
            >
              <option value="all">全部</option>
              <option value="pending">待確認</option>
              <option value="agreed">車主同意</option>
              <option value="deferred">暫緩</option>
              <option value="rejected">拒絕</option>
              <option value="cancelled">已取消</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">安全等級</label>
            <select
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px]"
              value={safetyLocal ?? "all"}
              onChange={(e) => setSafetyLocal(e.target.value as SafetyLevel | "all")}
            >
              <option value="all">全部</option>
              <option value="normal">一般建議</option>
              <option value="safety_related">⚠️ 安全相關</option>
              <option value="safety_critical">🔴 安全警示</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">指定工單</label>
            <select
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] min-w-[200px]"
              value={roIdLocal}
              onChange={(e) => setRoIdLocal(e.target.value)}
            >
              <option value="">全部工單</option>
              {roOptions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.ro_code} ({r.status}) {r.customer_name ?? ""}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">搜尋項目名稱</label>
            <input
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px]"
              value={qLocal}
              onChange={(e) => setQLocal(e.target.value)}
              placeholder="例：避震 / 煞車"
            />
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={submitFilter}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "查詢中⋯" : "查詢"}
            </button>
            <button
              type="button"
              onClick={resetFilter}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={() => setCreating(true)}
                disabled={isPending}
                className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
              >
                ＋ 新增追加項目
              </button>
            )}
          </div>
        </div>
      </section>

      {/* 費用變動摘要 — 指定工單 filter 選中後顯示 */}
      {costSummary && roIdLocal && (
        <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
          <div className="flex items-center gap-1 mb-2">
            <span className="material-symbols-outlined text-[16px] text-[#185FA5]">calculate</span>
            <span className="text-[13px] font-semibold text-[#2C2C2A]">費用變動摘要</span>
            <span className="text-[11px] text-[#9A9890] ml-1">（依本工單所有追加項目彙整）</span>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <CostSummaryItem
              label="原始工單金額"
              value={
                costSummary.ro_estimated_total != null
                  ? `NT$ ${costSummary.ro_estimated_total.toLocaleString()}`
                  : "—"
              }
              color="#5A5955"
            />
            <span className="text-[16px] text-[#9A9890] font-light">＋</span>
            <CostSummaryItem
              label={`追加小計（共 ${costSummary.counts.pending + costSummary.counts.agreed + costSummary.counts.deferred + costSummary.counts.rejected} 項）`}
              value={`NT$ ${costSummary.addon_subtotal.toLocaleString()}`}
              color="#854F0B"
            />
            <span className="text-[16px] text-[#9A9890] font-light">=</span>
            <CostSummaryItem
              label="預估總金額（若全部同意）"
              value={
                costSummary.projected_total != null
                  ? `NT$ ${costSummary.projected_total.toLocaleString()}`
                  : "—"
              }
              color="#0F6E56"
              highlight
            />
            <span className="ml-auto text-[11px] text-[#9A9890]">
              已同意：
              <span className="font-semibold text-[#3B6D11]">
                NT$ {costSummary.agreed_subtotal.toLocaleString()}
              </span>
              　待確認：{costSummary.counts.pending} 件
            </span>
          </div>
        </section>
      )}

      {/* Toolbar + 視圖切換 */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{optimisticRows.length}</b> 筆追加項目
        </span>
        <div className="ml-auto inline-flex bg-[#F2F2F2] rounded-lg p-0.5">
          <ViewTab active={viewMode === "list"} onClick={() => setViewMode("list")}>
            清單
          </ViewTab>
          <ViewTab active={viewMode === "kanban"} onClick={() => setViewMode("kanban")}>
            看板
          </ViewTab>
          <ViewTab active={viewMode === "followup"} onClick={() => setViewMode("followup")}>
            待追蹤閉環（{followupRows.length}）
          </ViewTab>
        </div>
      </div>

      {/* 視圖內容 */}
      {viewMode === "list" && (
        <DataGrid
          columns={columns}
          data={optimisticRows}
          rowKey={(r) => r.id}
          persistKey="parts/aftersales/addons"
          exportFileName="repair-order-addons"
          emptyMessage="目前沒有符合條件的追加項目"
          disabled={isPending}
          rowActionsWidth={canEdit ? 330 : 170}
          rowActions={(r) => (
            <>
              <Link
                href={`/parts/aftersales/addons/${r.id}`}
                className="h-[26px] px-2.5 rounded text-[11.5px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                詳情
              </Link>
              <Link
                href={`/parts/aftersales/repair-orders/${r.ro_id}/lines`}
                className="h-[26px] px-2.5 rounded text-[11.5px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                查工單
              </Link>
              {/* 📦 備料快捷鈕 — agreed 後顯示，連到維修領料新建頁帶 ro_id 參數 */}
              {r.customer_decision === "agreed" && (
                <Link
                  href={`/parts/issue/repair-pick/new?ro_id=${r.ro_id}&addon_id=${r.id}`}
                  className="h-[26px] px-2.5 rounded text-[11.5px] inline-flex items-center gap-1 bg-[#EAF4FB] border border-[#B8D9EF] text-[#185FA5] hover:bg-[#d4eaf8]"
                  title="前往維修領料備料頁"
                >
                  📦 備料
                </Link>
              )}
              {canEdit && r.customer_decision === "pending" && (
                <>
                  <button
                    type="button"
                    onClick={() => setDecideTarget(r)}
                    disabled={isPending}
                    className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50"
                  >
                    決策
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCancel(r.id)}
                    disabled={isPending}
                    className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9]"
                  >
                    取消
                  </button>
                </>
              )}
            </>
          )}
        />
      )}

      {viewMode === "kanban" && (
        <section
          className={`bg-white border border-[#EEECE6] rounded-lg p-3 ${isPending ? "opacity-60 pointer-events-none" : ""}`}
        >
          {kanbanCards.length === 0 ? (
            <p className="text-[12px] text-[#9A9890] text-center py-8">無追加項目資料</p>
          ) : (
            <>
              <p className="text-[11px] text-[#9A9890] mb-2">
                只有「待確認」可拖到右邊三欄（會開啟確認方式對話框），已決策請從詳情頁處理。已取消的不顯示。
              </p>
              <KanbanBoard
                columns={kanbanColumns}
                cards={kanbanCards}
                onMove={canEdit ? handleKanbanMove : undefined}
              />
            </>
          )}
        </section>
      )}

      {viewMode === "followup" && (
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">
              待追蹤閉環 — 安全相關 / 安全警示但被拒絕或暫緩的項目
            </span>
          </header>
          <div className="p-3">
            {followupRows.length === 0 ? (
              <p className="text-[12px] text-[#9A9890] text-center py-8">目前沒有待追蹤項目</p>
            ) : (
              <ul className="space-y-2">
                {followupRows.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-start gap-3 px-3 py-2 border border-[#EEECE6] rounded-md hover:bg-[#FDF8F0]"
                  >
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap mt-0.5 ${SAFETY_CHIP[r.safety_level]}`}
                    >
                      {SAFETY_LABEL[r.safety_level]}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-[12.5px]">
                        <Link
                          href={`/parts/aftersales/addons/${r.id}`}
                          className="font-medium text-[#1A3A5C] hover:text-[#185FA5]"
                        >
                          {r.name}
                        </Link>
                        <span
                          className={`px-1.5 py-0.5 rounded-md text-[11px] ${DECISION_CHIP[r.customer_decision]}`}
                        >
                          {DECISION_LABEL[r.customer_decision]}
                        </span>
                        <span className="text-[11px] text-[#9A9890]">
                          工單{" "}
                          <Link
                            href={`/parts/aftersales/repair-orders/${r.ro_id}/lines`}
                            className="font-mono text-[#185FA5] hover:underline"
                          >
                            {r.ro?.ro_code ?? "—"}
                          </Link>{" "}
                          · {r.ro?.customer_name ?? ""} {r.ro?.vehicle_license_plate ?? ""}
                        </span>
                      </div>
                      {r.tech_reason && (
                        <p className="text-[11.5px] text-[#5A5955] mt-1">{r.tech_reason}</p>
                      )}
                      {r.decision_note && (
                        <p className="text-[11.5px] text-[#9A9890] mt-0.5">
                          備註：{r.decision_note}
                        </p>
                      )}
                    </div>
                    <span className="text-[11px] text-[#9A9890] whitespace-nowrap mt-0.5">
                      {fmtTaipeiMonthDayTime(r.customer_decision_at ?? r.proposed_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* Decide Modal */}
      {decideTarget && (
        <DecideModal
          target={decideTarget}
          onClose={() => setDecideTarget(null)}
          onDone={(b, decision) => {
            if (b.ok && decision) applyOptimistic({ id: decideTarget.id, decision });
            showBanner(b);
            setDecideTarget(null);
            router.refresh();
            // 拒絕後自動切換到「待追蹤閉環」viewMode，引導 SA 處理閉環
            if (b.ok && decision === "rejected") {
              showBanner({
                ok: true,
                msg: "✓ 已標記為拒絕，已建立增項追蹤 → 自動切換至「待追蹤閉環」",
              });
              setTimeout(() => setViewMode("followup"), 800);
            }
          }}
        />
      )}

      {/* Create Modal */}
      {creating && (
        <CreateModal
          roOptions={roOptions}
          onClose={() => setCreating(false)}
          onDone={(b) => {
            showBanner(b);
            setCreating(false);
            router.refresh();
          }}
        />
      )}

      <p className="text-[10.5px] text-[#9A9890] mt-4">
        同意 → 自動寫 repair_order_lines (source=addon) · 拒絕/暫緩 + 安全等級 ≠ 一般 →
        自動標 requires_followup
      </p>
    </main>
  );
}

function ViewTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-[26px] px-3 rounded-md text-[11.5px] font-medium transition-all ${
        active ? "bg-white text-[#1A3A5C] shadow-sm" : "text-[#5A5955] hover:text-[#1A3A5C]"
      }`}
    >
      {children}
    </button>
  );
}

function KanbanCardBody({ row }: { row: RepairOrderAddonWithRo }) {
  return (
    <Link
      href={`/parts/aftersales/addons/${row.id}`}
      className="block -m-3 px-3 py-2 hover:bg-[#F8F7F4]"
    >
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[11.5px] font-semibold text-[#1A3A5C]">
          #{row.addon_no}
        </span>
        <span className="text-[12px] font-medium text-[#2C2C2A] truncate">{row.name}</span>
      </div>
      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
        <span className="font-mono text-[10.5px] text-[#9A9890]">{row.ro?.ro_code ?? "—"}</span>
        <span className={`px-1.5 py-0.5 rounded-md text-[10px] ${SAFETY_CHIP[row.safety_level]}`}>
          {SAFETY_LABEL[row.safety_level]}
        </span>
      </div>
      <div className="text-[10.5px] text-[#5A5955] mt-0.5">
        NT$ {Number(row.estimated_fee).toLocaleString()} · {TYPE_LABEL[row.addon_type]}
      </div>
    </Link>
  );
}

function CreateModal({
  roOptions,
  onClose,
  onDone,
}: {
  roOptions: RoOptionForAddons[];
  onClose: () => void;
  onDone: (b: { ok: boolean; msg: string }) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<AddonInput>({
    ro_id: roOptions[0]?.id ?? "",
    name: "",
    addon_type: "labor_and_parts",
    safety_level: "normal",
    estimated_fee: 0,
    tech_reason: "",
    confirm_method: "phone",
  });

  const submit = () => {
    startTransition(async () => {
      const r = await createAddonAction(form);
      onDone(r.ok ? { ok: true, msg: "✓ 已新增追加項目" } : { ok: false, msg: r.error });
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-[640px] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[14px] font-semibold text-[#2C2C2A] mb-3">＋ 新增追加項目</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="工單" full>
            <select
              className={inputClass}
              value={form.ro_id}
              onChange={(e) => setForm({ ...form, ro_id: e.target.value })}
              disabled={pending}
            >
              {roOptions.length === 0 && <option value="">（沒有可用工單）</option>}
              {roOptions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.ro_code} ({r.status}) {r.customer_name ?? ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="項目名稱" full>
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="例：後避震器油封更換"
              disabled={pending}
            />
          </Field>
          <Field label="類型">
            <select
              className={inputClass}
              value={form.addon_type}
              onChange={(e) =>
                setForm({ ...form, addon_type: e.target.value as AddonInput["addon_type"] })
              }
              disabled={pending}
            >
              <option value="labor">工項</option>
              <option value="parts">零件</option>
              <option value="labor_and_parts">零件+工</option>
            </select>
          </Field>
          <Field label="安全等級">
            <select
              className={inputClass}
              value={form.safety_level}
              onChange={(e) =>
                setForm({ ...form, safety_level: e.target.value as AddonInput["safety_level"] })
              }
              disabled={pending}
            >
              <option value="normal">一般建議</option>
              <option value="safety_related">⚠️ 安全相關</option>
              <option value="safety_critical">🔴 安全警示</option>
            </select>
          </Field>
          <Field label="估計費用 (NT$)">
            <input
              type="number"
              className={inputClass}
              value={form.estimated_fee}
              onChange={(e) => setForm({ ...form, estimated_fee: Number(e.target.value) })}
              disabled={pending}
            />
          </Field>
          <Field label="預設確認方式">
            <select
              className={inputClass}
              value={form.confirm_method ?? ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  confirm_method: (e.target.value || null) as ConfirmMethod | null,
                })
              }
              disabled={pending}
            >
              <option value="phone">電話口頭</option>
              <option value="onsite">現場本人</option>
              <option value="line">Line 文字</option>
            </select>
          </Field>
          <Field label="技師說明" full>
            <textarea
              className={`${inputClass} h-[60px] py-1.5`}
              value={form.tech_reason ?? ""}
              onChange={(e) => setForm({ ...form, tech_reason: e.target.value })}
              placeholder="簡短說明原因"
              disabled={pending}
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="h-[30px] px-3 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending || !form.ro_id || !form.name.trim()}
            className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
          >
            {pending ? "建立中⋯" : "送出追加項目"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DecideModal({
  target,
  onClose,
  onDone,
}: {
  target: RepairOrderAddonWithRo;
  onClose: () => void;
  onDone: (b: { ok: boolean; msg: string }, decision?: CustomerDecision) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [decision, setDecision] = useState<"agreed" | "deferred" | "rejected">("agreed");
  const [confirmMethod, setConfirmMethod] = useState<ConfirmMethod>(
    target.confirm_method ?? "phone",
  );
  const [note, setNote] = useState("");
  const [rejectionReason, setRejectionReason] = useState<RejectionReason | null>(null);

  // B-23：拒絕時必須先選結構化原因才能送出
  const blockedByReason = decision === "rejected" && !rejectionReason;

  const submit = () => {
    startTransition(async () => {
      const r = await decideAddonAction(target.id, {
        customer_decision: decision,
        confirm_method: confirmMethod,
        decision_note: note,
        rejection_reason: decision === "rejected" ? rejectionReason : null,
      });
      const msg =
        decision === "agreed"
          ? "✓ 車主已同意，已寫入維修明細"
          : decision === "deferred"
            ? "✓ 已標記為暫緩"
            : "✓ 已標記為拒絕";
      onDone(
        r.ok ? { ok: true, msg } : { ok: false, msg: r.error },
        r.ok ? decision : undefined,
      );
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-[560px] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[14px] font-semibold text-[#2C2C2A] mb-1">
          車主決策 — {target.name}
        </h2>
        <p className="text-[11.5px] text-[#9A9890] mb-3">
          工單 {target.ro?.ro_code ?? "—"} ・ {TYPE_LABEL[target.addon_type]} ・{" "}
          {SAFETY_LABEL[target.safety_level]} ・ 估價 NT${" "}
          {Number(target.estimated_fee).toLocaleString()}
        </p>

        <div className="mb-3">
          <label className="text-[11px] text-[#9A9890] font-medium block mb-1.5">決策</label>
          <div className="flex gap-2 flex-wrap">
            <DecideRadio
              cur={decision}
              val="agreed"
              onChange={setDecision}
              label="✅ 車主同意"
              activeClass="bg-[#0F6E56] text-white border-[#0F6E56]"
            />
            <DecideRadio
              cur={decision}
              val="deferred"
              onChange={setDecision}
              label="⏸ 暫緩"
              activeClass="bg-[#854F0B] text-white border-[#854F0B]"
            />
            <DecideRadio
              cur={decision}
              val="rejected"
              onChange={setDecision}
              label="❌ 拒絕（→ 增項閉環）"
              activeClass="bg-[#CC0000] text-white border-[#CC0000]"
            />
          </div>
        </div>

        {/* B-23：拒絕原因採集（固定標籤五選一，必填） */}
        {decision === "rejected" && (
          <div className="mb-3" data-testid="rejection-modal">
            <label className="text-[11px] text-[#9A9890] font-medium block mb-1.5">
              拒絕原因 <span className="text-[#CC0000]">*</span>
            </label>
            <div className="grid grid-cols-1 gap-1.5">
              {REJECTION_REASON_OPTIONS.map((opt) => {
                const active = rejectionReason === opt.code;
                return (
                  <button
                    key={opt.code}
                    type="button"
                    data-testid={`reason-${opt.code}`}
                    onClick={() => setRejectionReason(opt.code)}
                    disabled={pending}
                    className={`text-left h-[32px] px-3 rounded border text-[12.5px] transition-colors ${
                      active
                        ? "bg-[#FDECEA] border-[#CC0000] text-[#CC0000] font-medium"
                        : "bg-white border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="確認方式">
            <select
              className={inputClass}
              value={confirmMethod}
              onChange={(e) => setConfirmMethod(e.target.value as ConfirmMethod)}
              disabled={pending}
            >
              <option value="phone">電話口頭</option>
              <option value="onsite">現場本人</option>
              <option value="line">Line 文字</option>
            </select>
          </Field>
          <Field label={decision === "rejected" ? "補充說明（選填）" : "決策備註"} full>
            <input
              className={inputClass}
              value={note}
              maxLength={50}
              data-testid="rejection-note"
              onChange={(e) => setNote(e.target.value)}
              placeholder="例：車主表示下次再處理（最多 50 字）"
              disabled={pending}
            />
          </Field>
        </div>

        {decision === "agreed" && (
          <p className="mt-3 text-[11.5px] text-[#3B6D11] bg-[#EAF3DE] border border-[#C5DC9F] rounded px-2.5 py-1.5">
            同意後將自動寫入工單明細（{TYPE_LABEL[target.addon_type]}），可至「維修明細」頁查看。
          </p>
        )}
        {decision !== "agreed" && target.safety_level !== "normal" && (
          <p className="mt-3 text-[11.5px] text-[#CC0000] bg-[#FDECEA] border border-[#F5AEAD] rounded px-2.5 py-1.5">
            此項屬「{SAFETY_LABEL[target.safety_level]}」，將自動標記為「待追蹤」進入增項閉環看板。
          </p>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="h-[30px] px-3 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending || blockedByReason}
            data-testid="confirm-reject-btn"
            className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50"
          >
            {pending ? "送出中⋯" : "送出決策"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DecideRadio({
  cur,
  val,
  onChange,
  label,
  activeClass,
}: {
  cur: string;
  val: "agreed" | "deferred" | "rejected";
  onChange: (v: "agreed" | "deferred" | "rejected") => void;
  label: string;
  activeClass: string;
}) {
  const active = cur === val;
  return (
    <button
      type="button"
      onClick={() => onChange(val)}
      className={`h-[30px] px-3 rounded-full text-[12px] border ${
        active ? activeClass : "bg-white border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
      }`}
    >
      {label}
    </button>
  );
}

function Field({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1 ${full ? "col-span-2" : ""}`}>
      <label className="text-[11px] text-[#9A9890] font-medium">{label}</label>
      {children}
    </div>
  );
}

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none disabled:bg-[#F8F7F4]";

/** 費用摘要顯示格 */
function CostSummaryItem({
  label,
  value,
  color,
  highlight,
}: {
  label: string;
  value: string;
  color: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10.5px] text-[#9A9890]">{label}</span>
      <span
        className={`font-mono font-semibold ${highlight ? "text-[16px]" : "text-[14px]"}`}
        style={{ color }}
      >
        {value}
      </span>
    </div>
  );
}
