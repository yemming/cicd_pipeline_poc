"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { KpiCard, FlowDiagram, type FlowNode, type FlowEdge } from "@/components/visualization";
import { FunnelChart, type FunnelDatum } from "@/components/charts";
import {
  resolveWorkorderLoopEntryAction,
  escalateWorkorderLoopEntryAction,
  deleteWorkorderLoopEntryAction,
  updateWorkorderLoopEntryAction,
} from "@/domain/alerts";
import { WORKORDER_LOOP_STATUS_CHIP, WORKORDER_LOOP_STATUS_OPTIONS } from "@/domain/alerts.constants";
import {
  LOOP_STAGE_CHIP,
  LOOP_STAGE_LABELS,
  LOOP_STAGE_OPTIONS,
  LOOP_STAGE_ORDER,
  LOOP_STAGE_TONES,
  type LoopStageKey,
} from "@/domain/parts-alert-work-order-loop.constants";

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none";
const labelClass = "text-[11px] text-[#9A9890] font-medium";

export type LoopBoardRow = {
  id: string;
  brand_id: string;
  ro_no: string;
  missing_parts: string;
  sa_name: string | null;
  shortage_reason: string | null;
  po_no: string | null;
  eta_label: string | null;
  days_pending: number;
  status: string;
  is_overdue: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  stage: LoopStageKey;
};

export type LoopKpi = {
  open_count: number;
  overdue_count: number;
  resolved_count: number;
  total_count: number;
  avg_cycle_days: number;
  avg_open_days: number;
};

export type LoopStageStat = {
  key: LoopStageKey;
  label: string;
  count: number;
  avg_days: number;
  overdue_count: number;
};

export function WorkorderLoopBoard({
  rows,
  kpi,
  stages,
  funnel,
  saOptions,
  canEdit,
  errorMsg,
  initialQ,
  initialStatus,
  initialOverdue,
  initialStage,
  initialSa,
}: {
  rows: LoopBoardRow[];
  kpi: LoopKpi;
  stages: LoopStageStat[];
  funnel: FunnelDatum[];
  saOptions: string[];
  canEdit: boolean;
  errorMsg: string | null;
  initialQ: string;
  initialStatus: string;
  initialOverdue: string;
  initialStage: string;
  initialSa: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [q, setQ] = useState(initialQ);
  const [status, setStatus] = useState(initialStatus);
  const [overdue, setOverdue] = useState(initialOverdue);
  const [stage, setStage] = useState(initialStage);
  const [sa, setSa] = useState(initialSa);
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);

  function buildHref(extra: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      q: q || undefined,
      status: status || undefined,
      overdue_only: overdue || undefined,
      stage: stage || undefined,
      sa_name: sa || undefined,
      ...extra,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v === undefined || v === "" || v === null) continue;
      params.set(k, v);
    }
    const qs = params.toString();
    return `/parts/alerts/work-order-loop${qs ? "?" + qs : ""}`;
  }

  function applyFilter() {
    startTransition(() => router.push(buildHref({})));
  }

  function resetFilter() {
    setQ("");
    setStatus("");
    setOverdue("");
    setStage("");
    setSa("");
    startTransition(() => router.push("/parts/alerts/work-order-loop"));
  }

  function showBanner(b: { ok: boolean; msg: string }) {
    setBanner(b);
    if (b.ok) setTimeout(() => setBanner(null), 2200);
  }

  function onStageNodeClick(key: LoopStageKey) {
    setStage(key);
    startTransition(() => router.push(buildHref({ stage: key })));
  }

  function resolve(r: LoopBoardRow) {
    startTransition(async () => {
      const res = await resolveWorkorderLoopEntryAction(r.id);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ ${r.ro_no} 待料已解除` });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function escalate(r: LoopBoardRow) {
    startTransition(async () => {
      const res = await escalateWorkorderLoopEntryAction(r.id);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ ${r.ro_no} 已標記催單` });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function removeRow(r: LoopBoardRow) {
    if (!confirm(`確定刪除待料工單「${r.ro_no}」？此動作無法復原。`)) return;
    startTransition(async () => {
      const res = await deleteWorkorderLoopEntryAction(r.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  // ── DataGrid columns ──
  const columns = useMemo<DataGridColumn<LoopBoardRow>[]>(() => {
    const textEdit = (field: "missing_parts" | "sa_name" | "shortage_reason" | "po_no" | "eta_label") =>
      canEdit
        ? {
            type: "text" as const,
            getValue: (r: LoopBoardRow) => (r[field] as string | null) ?? "",
            onSave: async (r: LoopBoardRow, value: string) => {
              const v = value.trim();
              if (field === "missing_parts" && !v) {
                return { ok: false as const, error: "缺料備件不可為空" };
              }
              const patch: Record<string, string | null> = {};
              patch[field] = v || null;
              const res = await updateWorkorderLoopEntryAction(r.id, patch);
              if (res.ok) {
                showBanner({ ok: true, msg: "✓ 已更新" });
                router.refresh();
                return { ok: true as const };
              }
              return { ok: false as const, error: res.error };
            },
          }
        : undefined;

    return [
      {
        id: "ro_no",
        header: "工單號",
        width: 170,
        hideable: false,
        cell: (r) => (
          <Link
            href={`/parts/alerts/work-order-loop/${r.id}`}
            className="font-mono font-semibold text-[#1A3A5C] hover:text-[#185FA5] hover:underline"
          >
            {r.ro_no}
          </Link>
        ),
        exportValue: (r) => r.ro_no,
        sortValue: (r) => r.ro_no,
      },
      {
        id: "stage",
        header: "閉環階段",
        width: 110,
        cell: (r) => (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap border ${
              LOOP_STAGE_CHIP[r.stage]
            }`}
          >
            {LOOP_STAGE_LABELS[r.stage]}
          </span>
        ),
        exportValue: (r) => LOOP_STAGE_LABELS[r.stage],
        sortValue: (r) => LOOP_STAGE_ORDER.indexOf(r.stage),
      },
      {
        id: "missing_parts",
        header: "缺料備件",
        width: 230,
        cell: (r) => r.missing_parts,
        exportValue: (r) => r.missing_parts,
        sortValue: (r) => r.missing_parts,
        editable: textEdit("missing_parts"),
      },
      {
        id: "sa_name",
        header: "SA 人員",
        width: 100,
        cell: (r) => r.sa_name ?? "—",
        exportValue: (r) => r.sa_name ?? "",
        sortValue: (r) => r.sa_name ?? "",
        editable: textEdit("sa_name"),
      },
      {
        id: "shortage_reason",
        header: "待料原因",
        width: 130,
        cell: (r) => r.shortage_reason ?? "—",
        exportValue: (r) => r.shortage_reason ?? "",
        sortValue: (r) => r.shortage_reason ?? "",
        editable: textEdit("shortage_reason"),
      },
      {
        id: "po_no",
        header: "補貨單號",
        width: 150,
        cell: (r) => (
          <span className="font-mono text-[#0F6E56]">{r.po_no ?? "—"}</span>
        ),
        exportValue: (r) => r.po_no ?? "",
        sortValue: (r) => r.po_no ?? "",
        editable: textEdit("po_no"),
      },
      {
        id: "eta_label",
        header: "預計到貨",
        width: 110,
        cell: (r) => (
          <span className="font-mono text-[#854F0B]">{r.eta_label ?? "—"}</span>
        ),
        exportValue: (r) => r.eta_label ?? "",
        sortValue: (r) => r.eta_label ?? "",
        editable: textEdit("eta_label"),
      },
      {
        id: "days_pending",
        header: "待料天數",
        width: 90,
        align: "right",
        cell: (r) => (
          <span
            className={`font-mono ${
              r.is_overdue ? "text-[#CC0000] font-semibold" : "text-[#854F0B]"
            }`}
          >
            {r.days_pending} 天
          </span>
        ),
        exportValue: (r) => String(r.days_pending),
        sortValue: (r) => r.days_pending,
      },
      {
        id: "status",
        header: "狀態",
        width: 90,
        cell: (r) => {
          const def = WORKORDER_LOOP_STATUS_CHIP[r.status] ?? WORKORDER_LOOP_STATUS_CHIP.pending;
          return (
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${def.chip}`}
            >
              {def.label}
            </span>
          );
        },
        exportValue: (r) => WORKORDER_LOOP_STATUS_CHIP[r.status]?.label ?? r.status,
        sortValue: (r) => r.status,
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit]);

  // ── FlowDiagram nodes / edges ──
  const flowNodes = useMemo<FlowNode[]>(() => {
    return LOOP_STAGE_ORDER.map((key) => {
      const stat = stages.find((s) => s.key === key);
      const count = stat?.count ?? 0;
      const avg = stat?.avg_days ?? 0;
      return {
        id: key,
        label: `${LOOP_STAGE_LABELS[key]}  ${count} 件 · ${avg}d`,
        tone: LOOP_STAGE_TONES[key],
      };
    });
  }, [stages]);

  const flowEdges = useMemo<FlowEdge[]>(() => {
    const e: FlowEdge[] = [];
    for (let i = 0; i < LOOP_STAGE_ORDER.length - 1; i++) {
      e.push({ from: LOOP_STAGE_ORDER[i]!, to: LOOP_STAGE_ORDER[i + 1]! });
    }
    return e;
  }, []);

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">工單增項閉環</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          10.4 ★3 · A 級
        </span>
        <span className="text-[12px] text-[#9A9890]">
          維修工單缺料 → 自動補貨觸發 → 待料解除 → SA 通知，閉環健康度儀表板
        </span>
      </header>

      {/* Error banner（error 三狀態之一） */}
      {errorMsg ? (
        <div className="bg-[#FDECEA] border border-[#F5AEAD] rounded-md px-4 py-2.5 text-[12px] text-[#CC0000]">
          ⚠ 資料載入失敗：{errorMsg}
        </div>
      ) : null}

      {/* KPI 列 */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          tone="red"
          layout="vertical"
          label="未閉環件數"
          value={kpi.open_count}
        />
        <KpiCard
          tone="amber"
          layout="vertical"
          label="超期件數"
          value={kpi.overdue_count}
        />
        <KpiCard
          tone="green"
          layout="vertical"
          label="已解除（累計）"
          value={kpi.resolved_count}
        />
        <KpiCard
          tone="blue"
          layout="vertical"
          label="平均閉環天數"
          value={`${kpi.avg_cycle_days} 天`}
        />
      </section>

      {/* FlowDiagram + FunnelChart 並排 */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 bg-white border border-[#EEECE6] rounded-lg px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[13px] font-semibold text-[#2C2C2A]">
              🔄 工單缺料完整閉環流程（點階段卡片可篩選）
            </div>
            {stage ? (
              <button
                type="button"
                onClick={() => {
                  setStage("");
                  startTransition(() => router.push(buildHref({ stage: undefined })));
                }}
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                清除階段篩選
              </button>
            ) : null}
          </div>

          {/* 階段卡片列（可點 → drill down） */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-3">
            {stages.map((s) => {
              const isActive = stage === s.key;
              return (
                <button
                  type="button"
                  key={s.key}
                  onClick={() => onStageNodeClick(s.key)}
                  className={`text-left rounded-lg border px-2.5 py-2 transition hover:shadow-sm ${
                    isActive
                      ? "border-tone-blue-500 ring-1 ring-tone-blue-500 bg-tone-blue-50"
                      : "border-[#EEECE6] bg-white hover:border-[#9A9890]"
                  }`}
                >
                  <div className="text-[11px] text-[#9A9890]">{s.label}</div>
                  <div className="mt-0.5 flex items-baseline gap-1.5">
                    <span className="text-[18px] font-semibold text-[#2C2C2A]">{s.count}</span>
                    <span className="text-[10.5px] text-[#9A9890]">件</span>
                  </div>
                  <div className="text-[10.5px] text-[#9A9890]">平均 {s.avg_days}d</div>
                  {s.overdue_count > 0 ? (
                    <div className="text-[10.5px] text-[#CC0000]">超期 {s.overdue_count}</div>
                  ) : null}
                </button>
              );
            })}
          </div>

          {/* SVG FlowDiagram（horizontal） */}
          <FlowDiagram nodes={flowNodes} edges={flowEdges} currentNodeId={stage || undefined} />
        </div>

        <div className="bg-white border border-[#EEECE6] rounded-lg px-5 py-4">
          <div className="text-[13px] font-semibold text-[#2C2C2A] mb-2">📉 階段漏斗</div>
          {funnel.every((d) => d.value === 0) ? (
            <div className="h-[260px] flex items-center justify-center text-[12px] text-[#9A9890]">
              尚無資料
            </div>
          ) : (
            <FunnelChart data={funnel} tone="purple" size="md" />
          )}
        </div>
      </section>

      {/* Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>工單 / 缺料 / 補貨單搜尋</label>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilter()}
              placeholder="RO 號、零件名稱、PO 號..."
              className={`${inputClass} w-[240px]`}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>閉環階段</label>
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value)}
              className={`${inputClass} w-[140px]`}
            >
              {LOOP_STAGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>狀態</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={`${inputClass} w-[120px]`}
            >
              <option value="">全部</option>
              {WORKORDER_LOOP_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>SA 人員</label>
            <select
              value={sa}
              onChange={(e) => setSa(e.target.value)}
              className={`${inputClass} w-[120px]`}
            >
              <option value="">全部</option>
              {saOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>只看逾期</label>
            <select
              value={overdue}
              onChange={(e) => setOverdue(e.target.value)}
              className={`${inputClass} w-[100px]`}
            >
              <option value="">全部</option>
              <option value="true">是</option>
            </select>
          </div>

          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={applyFilter}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "查詢中⋯" : "查詢"}
            </button>
            <button
              type="button"
              onClick={resetFilter}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
            >
              重置
            </button>
            <Link
              href="/parts/alerts/work-order-loop/new"
              aria-disabled={!canEdit}
              tabIndex={!canEdit ? -1 : 0}
              title={canEdit ? "" : "沒有編輯權限"}
              className={`h-[30px] px-3 rounded text-[12.5px] font-medium inline-flex items-center bg-[#0F6E56] text-white hover:bg-[#0a5742] ${
                !canEdit ? "opacity-50 pointer-events-none" : ""
              }`}
            >
              ＋ 新增待料工單
            </Link>
          </div>
        </div>
      </section>

      {/* Toolbar 摘要列 */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{rows.length}</b> 筆 · 未閉環{" "}
          <b className="text-[#CC0000]">{kpi.open_count}</b> · 超期{" "}
          <b className="text-[#CC0000]">{kpi.overdue_count}</b> · 平均{" "}
          <b className="text-[#2C2C2A]">{kpi.avg_open_days}</b> 天
        </span>
      </div>

      {/* DataGrid（empty 三狀態之三：emptyMessage 由 DataGrid 處理） */}
      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="parts/alerts/work-order-loop"
        exportFileName="workorder-loop-entries"
        emptyMessage={
          stage
            ? `「${LOOP_STAGE_LABELS[stage as LoopStageKey]}」階段目前沒有工單`
            : "目前無待料工單"
        }
        disabled={isPending}
        rowActionsWidth={260}
        rowActions={(r) => (
          <div className="flex gap-1.5">
            <Link
              href={`/parts/alerts/work-order-loop/${r.id}`}
              className="h-[26px] px-2.5 rounded text-[11.5px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              編輯
            </Link>
            {r.status !== "resolved" ? (
              <>
                <button
                  type="button"
                  onClick={() => resolve(r)}
                  disabled={!canEdit || isPending}
                  className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
                >
                  到庫解除
                </button>
                <button
                  type="button"
                  onClick={() => escalate(r)}
                  disabled={!canEdit || isPending}
                  className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                >
                  催單
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => removeRow(r)}
              disabled={!canEdit || isPending}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
            >
              刪除
            </button>
          </div>
        )}
      />

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
    </main>
  );
}
