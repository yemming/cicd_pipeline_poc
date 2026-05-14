"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import {
  resolveWorkorderLoopEntryAction,
  escalateWorkorderLoopEntryAction,
  deleteWorkorderLoopEntryAction,
  updateWorkorderLoopEntryAction,
  type WorkorderLoopRow,
} from "@/domain/alerts";
import { WORKORDER_LOOP_STATUS_CHIP, WORKORDER_LOOP_STATUS_OPTIONS } from "@/domain/alerts.constants";

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none";
const labelClass = "text-[11px] text-[#9A9890] font-medium";

const FLOW_STEPS = [
  { icon: "🔧", label: "SA 領料", sub: "工單出庫 / 庫存不足", color: "border-[#CC0000] bg-[#FDECEA] text-[#CC0000]" },
  { icon: "⚡", label: "缺料告警", sub: "工單進入「待料」狀態", color: "border-[#CC0000] bg-[#FDECEA] text-[#CC0000]" },
  { icon: "📋", label: "自動建需求", sub: "系統自動建立緊急補貨需求", color: "border-[#854F0B] bg-[#FDF3E3] text-[#854F0B]" },
  { icon: "🛒", label: "採購審核", sub: "主管審核緊急採購單", color: "border-[#185FA5] bg-[#EAF4FB] text-[#185FA5]" },
  { icon: "📥", label: "備件到庫", sub: "採購入庫 / 庫存更新", color: "border-[#0F6E56] bg-[#E8F5F0] text-[#0F6E56]" },
  { icon: "✅", label: "自動解除", sub: "待料解除 / SA LINE 通知", color: "border-[#3B6D11] bg-[#EAF3DE] text-[#3B6D11]" },
];

export function WorkorderLoopBoard({
  entries,
  canEdit,
  initialQ,
  initialStatus,
  initialOverdue,
}: {
  entries: WorkorderLoopRow[];
  canEdit: boolean;
  initialQ: string;
  initialStatus: string;
  initialOverdue: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [q, setQ] = useState(initialQ);
  const [status, setStatus] = useState(initialStatus);
  const [overdue, setOverdue] = useState(initialOverdue);
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);

  const rows = useMemo(() => entries, [entries]);

  const pendingCount = rows.filter((e) => e.status === "pending" || e.status === "escalated").length;

  function buildHref(extra: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      q: q || undefined,
      status: status || undefined,
      overdue_only: overdue || undefined,
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
    startTransition(() => router.push("/parts/alerts/work-order-loop"));
  }

  function showBanner(b: { ok: boolean; msg: string }) {
    setBanner(b);
    if (b.ok) setTimeout(() => setBanner(null), 2200);
  }

  function resolve(r: WorkorderLoopRow) {
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

  function escalate(r: WorkorderLoopRow) {
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

  function removeRow(r: WorkorderLoopRow) {
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

  const columns = useMemo<DataGridColumn<WorkorderLoopRow>[]>(() => {
    const textEdit = (field: "missing_parts" | "sa_name" | "shortage_reason" | "po_no" | "eta_label") =>
      canEdit
        ? {
            type: "text" as const,
            getValue: (r: WorkorderLoopRow) => (r[field] as string | null) ?? "",
            onSave: async (r: WorkorderLoopRow, value: string) => {
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
        id: "missing_parts",
        header: "缺料備件",
        width: 240,
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
        width: 140,
        cell: (r) => r.shortage_reason ?? "—",
        exportValue: (r) => r.shortage_reason ?? "",
        sortValue: (r) => r.shortage_reason ?? "",
        editable: textEdit("shortage_reason"),
      },
      {
        id: "po_no",
        header: "補貨單號",
        width: 160,
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
              r.is_overdue ? "text-[#CC0000]" : "text-[#854F0B]"
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
        width: 100,
        cell: (r) => {
          const def =
            WORKORDER_LOOP_STATUS_CHIP[r.status] ?? WORKORDER_LOOP_STATUS_CHIP.pending;
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

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">工單增項閉環</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          10.4
        </span>
        <span className="text-[12px] text-[#9A9890]">
          維修工單缺料後的自動補貨觸發 / 待料解除 / SA 通知完整閉環
        </span>
      </header>

      {/* 串接提示 */}
      <div className="bg-[#EEEDFE] border border-[#AFA9EC] rounded-md px-4 py-2.5 text-[12px] text-[#26215C] flex items-center justify-between gap-2.5 flex-wrap">
        <div>
          🔗 此頁面與售後工單模組「增項閉環子模組」串接 — 庫存缺料 → 自動推送至售後工單追蹤；車主同意回廠 → 庫存自動預留備料
        </div>
        <Link
          href="/parts/issue/repair-pick"
          className="h-[28px] px-3 inline-flex items-center rounded text-[11.5px] font-medium bg-[#534AB7] text-white hover:bg-[#3F379B]"
        >
          → 維修領料出庫
        </Link>
      </div>

      {/* 流程圖（context） */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-5 py-4">
        <div className="text-[13px] font-semibold text-[#2C2C2A] mb-3.5">
          🔄 工單缺料完整閉環流程
        </div>
        <div className="flex items-center gap-0 overflow-x-auto pb-2">
          {FLOW_STEPS.map((s, idx) => (
            <div key={s.label} className="flex items-center">
              <div className="flex flex-col items-center gap-1.5 min-w-[100px]">
                <div
                  className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-[18px] ${s.color}`}
                >
                  {s.icon}
                </div>
                <div className="text-[11.5px] font-semibold text-center">{s.label}</div>
                <div className="text-[10px] text-[#9A9890] text-center leading-tight">
                  {s.sub}
                </div>
              </div>
              {idx < FLOW_STEPS.length - 1 && (
                <div className="text-[#D5D3CB] text-[20px] px-1 mb-[16px]">→</div>
              )}
            </div>
          ))}
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
              className={`${inputClass} w-[260px]`}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>狀態</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={`${inputClass} w-[130px]`}
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

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{rows.length}</b> 筆待料工單，未解除{" "}
          <b className="text-[#CC0000]">{pendingCount}</b> 筆
        </span>
      </div>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="parts/alerts/work-order-loop"
        exportFileName="workorder-loop-entries"
        emptyMessage="目前無待料工單"
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
