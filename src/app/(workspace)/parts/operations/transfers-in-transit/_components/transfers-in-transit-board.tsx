"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { KpiCard } from "@/components/visualization/KpiCard";
import { FlowDiagram } from "@/components/visualization/FlowDiagram";
import type {
  TransferInTransitLine,
  TransferListRow,
  TransfersInTransitStats,
} from "@/domain/transfers";
import {
  clearTransferDelayedAction,
  markTransferAsDelayedAction,
} from "@/lib/parts-operations/transfers-actions";

const STATUS_LABEL: Record<string, { label: string; chip: string }> = {
  in_transit: { label: "在途", chip: "bg-[#FDF3E3] text-[#854F0B]" },
  partial: { label: "部分到貨", chip: "bg-[#FDF3E3] text-[#854F0B]" },
  received: { label: "已收貨", chip: "bg-[#EAF3DE] text-[#3B6D11]" },
  closed: { label: "已結案", chip: "bg-[#F2F2F2] text-[#6B6A68]" },
  cancelled: { label: "已取消", chip: "bg-[#FDECEA] text-[#CC0000]" },
  draft: { label: "草稿", chip: "bg-[#FEF9C3] text-[#5C4500]" },
};

function fmtDate(d: string | null): string {
  return d ? d.replace(/-/g, "/") : "—";
}

/** 計算延遲狀態（同 helper 的邏輯，client 側拍一份避免 round-trip） */
function isDelayed(r: TransferListRow): boolean {
  const meta = (r.metadata ?? {}) as Record<string, unknown>;
  if (meta.delayed === true) return true;
  if (!r.expected_arrival_date) return false;
  if (Number(r.qty_received_total ?? 0) >= Number(r.qty_shipped_total ?? 0))
    return false;
  const today = new Date().toISOString().slice(0, 10);
  return r.expected_arrival_date < today;
}

function delayedReason(r: TransferListRow): string | null {
  const meta = (r.metadata ?? {}) as Record<string, unknown>;
  const reason = meta.delayed_reason;
  return typeof reason === "string" ? reason : null;
}

export function TransfersInTransitBoard({
  rows,
  totalCount,
  page,
  pageSize,
  initialStatus,
  initialQ,
  initialSource,
  initialTarget,
  initialDateFrom,
  initialDateTo,
  stats,
  lines,
  warehouses,
  canEdit,
}: {
  rows: TransferListRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  initialStatus: string;
  initialQ: string;
  initialSource: string;
  initialTarget: string;
  initialDateFrom: string;
  initialDateTo: string;
  stats: TransfersInTransitStats;
  lines: TransferInTransitLine[];
  warehouses: Array<{ id: string; code: string | null; name: string }>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState(initialStatus);
  const [q, setQ] = useState(initialQ);
  const [source, setSource] = useState(initialSource);
  const [target, setTarget] = useState(initialTarget);
  const [dateFrom, setDateFrom] = useState(initialDateFrom);
  const [dateTo, setDateTo] = useState(initialDateTo);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [banner, setBanner] = useState<
    { ok: boolean; msg: string } | null
  >(null);

  // 把 lines 拆成 by tr_id map
  const linesByTrId = useMemo(() => {
    const m = new Map<string, TransferInTransitLine[]>();
    for (const l of lines) {
      const arr = m.get(l.tr_id) ?? [];
      arr.push(l);
      m.set(l.tr_id, arr);
    }
    return m;
  }, [lines]);

  function showBanner(b: { ok: boolean; msg: string }) {
    setBanner(b);
    if (b.ok) {
      setTimeout(() => setBanner(null), 2200);
    }
  }

  function buildHref(extra: Record<string, string | number | undefined>) {
    const params = new URLSearchParams();
    const merged: Record<string, string | number | undefined> = {
      status: status || undefined,
      q: q || undefined,
      source: source || undefined,
      target: target || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      ...extra,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v === undefined || v === "" || v === null) continue;
      params.set(k, String(v));
    }
    const qs = params.toString();
    return `/parts/operations/transfers-in-transit${qs ? "?" + qs : ""}`;
  }

  function applyFilter() {
    startTransition(() => router.push(buildHref({ page: undefined })));
  }

  function resetFilter() {
    setStatus("");
    setQ("");
    setSource("");
    setTarget("");
    setDateFrom("");
    setDateTo("");
    startTransition(() =>
      router.push("/parts/operations/transfers-in-transit"),
    );
  }

  function goToPage(nextPage: number) {
    startTransition(() => router.push(buildHref({ page: nextPage })));
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function markDelayed(r: TransferListRow) {
    if (!canEdit) {
      showBanner({ ok: false, msg: "沒有編輯權限" });
      return;
    }
    const reason = window.prompt("延遲原因（可選）：", "");
    if (reason === null) return;
    startTransition(async () => {
      const res = await markTransferAsDelayedAction(r.id, reason || undefined);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ ${r.tr_no} 已標記為延遲` });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: `標記失敗：${res.error}` });
      }
    });
  }

  function clearDelayed(r: TransferListRow) {
    if (!canEdit) {
      showBanner({ ok: false, msg: "沒有編輯權限" });
      return;
    }
    startTransition(async () => {
      const res = await clearTransferDelayedAction(r.id);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ ${r.tr_no} 已撤銷延遲標記` });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: `撤銷失敗：${res.error}` });
      }
    });
  }

  const columns = useMemo<DataGridColumn<TransferListRow>[]>(
    () => [
      {
        id: "expand",
        header: "",
        width: 32,
        hideable: false,
        sortable: false,
        cell: (r) => (
          <button
            type="button"
            onClick={() => toggleExpand(r.id)}
            className="inline-flex items-center justify-center w-6 h-6 rounded text-[14px] text-[#5A5955] hover:bg-[#F8F7F4] hover:text-[#1A3A5C]"
            aria-label={expanded[r.id] ? "收起明細" : "展開明細"}
            title={expanded[r.id] ? "收起明細" : "展開明細"}
          >
            {expanded[r.id] ? "▼" : "▶"}
          </button>
        ),
        exportValue: () => "",
      },
      {
        id: "tr_no",
        header: "調撥單號",
        width: 150,
        hideable: false,
        cell: (r) => (
          <Link
            href={`/parts/receipt/transfer-in/${r.id}`}
            className="font-mono font-semibold text-[12px] text-[#1A3A5C] hover:text-[#185FA5] hover:underline"
          >
            {r.tr_no ?? "—"}
          </Link>
        ),
        exportValue: (r) => r.tr_no ?? "",
        sortValue: (r) => r.tr_no ?? "",
      },
      {
        id: "route",
        header: "來源 → 目標",
        width: 240,
        cell: (r) => (
          <span className="text-[12.5px]">
            <span className="text-[#5A5955]">
              {r.source_warehouse_name ?? "—"}
            </span>
            <span className="mx-1.5 text-[#9A9890]">→</span>
            <span className="text-[#2C2C2A] font-medium">
              {r.target_warehouse_name ?? "—"}
            </span>
          </span>
        ),
        exportValue: (r) =>
          `${r.source_warehouse_name ?? ""} → ${r.target_warehouse_name ?? ""}`,
        sortValue: (r) => r.source_warehouse_name ?? "",
      },
      {
        id: "status",
        header: "狀態",
        width: 100,
        hideable: false,
        cell: (r) => {
          const def = STATUS_LABEL[r.status ?? ""] ?? STATUS_LABEL.in_transit;
          return (
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${def.chip}`}
            >
              {def.label}
            </span>
          );
        },
        exportValue: (r) =>
          (STATUS_LABEL[r.status ?? ""] ?? STATUS_LABEL.in_transit).label,
        sortValue: (r) => r.status ?? "",
      },
      {
        id: "delayed",
        header: "是否延遲",
        width: 110,
        cell: (r) => {
          if (!isDelayed(r))
            return (
              <span className="text-[11px] text-[#9A9890]">—</span>
            );
          const reason = delayedReason(r);
          return (
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDECEA] text-[#CC0000] whitespace-nowrap"
              title={reason ?? "ETA 已過且未完成收貨"}
            >
              延遲
            </span>
          );
        },
        exportValue: (r) =>
          isDelayed(r) ? `延遲${delayedReason(r) ? `（${delayedReason(r)}）` : ""}` : "",
        sortValue: (r) => (isDelayed(r) ? 1 : 0),
      },
      {
        id: "ship_date",
        header: "出貨日",
        width: 110,
        cell: (r) => (
          <span className="font-mono text-[12px]">{fmtDate(r.ship_date)}</span>
        ),
        exportValue: (r) => r.ship_date ?? "",
        sortValue: (r) => r.ship_date ?? "",
      },
      {
        id: "expected_arrival_date",
        header: "預計到貨",
        width: 110,
        cell: (r) => {
          const today = new Date().toISOString().slice(0, 10);
          const overdue =
            r.expected_arrival_date &&
            r.expected_arrival_date < today &&
            (r.status === "in_transit" || r.status === "partial");
          return (
            <span
              className={`font-mono text-[12px] ${overdue ? "text-[#CC0000] font-semibold" : ""}`}
            >
              {fmtDate(r.expected_arrival_date)}
            </span>
          );
        },
        exportValue: (r) => r.expected_arrival_date ?? "",
        sortValue: (r) => r.expected_arrival_date ?? "",
      },
      {
        id: "qty_shipped_received",
        header: "出貨/到貨",
        width: 110,
        align: "right",
        sortable: false,
        cell: (r) => (
          <span className="font-mono text-[12px]">
            {Number(r.qty_shipped_total ?? 0).toLocaleString()} /{" "}
            {Number(r.qty_received_total ?? 0).toLocaleString()}
          </span>
        ),
        exportValue: (r) =>
          `${r.qty_shipped_total ?? 0} / ${r.qty_received_total ?? 0}`,
      },
      {
        id: "logistics_tracking_no",
        header: "物流追蹤",
        width: 140,
        defaultHidden: true,
        cell: (r) => (
          <span className="font-mono text-[11.5px] text-[#5A5955]">
            {r.logistics_tracking_no ?? "—"}
          </span>
        ),
        exportValue: (r) => r.logistics_tracking_no ?? "",
        sortValue: (r) => r.logistics_tracking_no ?? "",
      },
      {
        id: "reason",
        header: "原因",
        width: 180,
        cell: (r) => (
          <span className="text-[12px] text-[#5A5955]">{r.reason ?? "—"}</span>
        ),
        exportValue: (r) => r.reason ?? "",
        sortValue: (r) => r.reason ?? "",
      },
    ],
    [expanded],
  );

  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";

  // FlowDiagram nodes
  const flowNodes = [
    {
      id: "issued",
      label: `已出貨 ${stats.statusCounts.issued}`,
      tone: "blue" as const,
    },
    {
      id: "in_transit",
      label: `運送中 ${stats.statusCounts.in_transit}`,
      tone: "amber" as const,
    },
    {
      id: "partial",
      label: `部分到貨 ${stats.statusCounts.partial}`,
      tone: "amber" as const,
    },
    {
      id: "received",
      label: `已驗收 ${stats.statusCounts.received}`,
      tone: "green" as const,
    },
  ];
  const flowEdges = [
    { from: "issued", to: "in_transit" },
    { from: "in_transit", to: "partial" },
    { from: "partial", to: "received" },
  ];
  // 當前主流 node：有 partial 件數 → partial，否則 in_transit
  const currentNode =
    stats.statusCounts.partial > 0 ? "partial" : "in_transit";

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">
          調撥在途查詢
        </h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          M04L-2
        </span>
        <span className="text-[12px] text-[#9A9890]">
          盯著出貨後尚未完全到貨的調撥單，掌握延遲件與預計到貨件
        </span>
      </header>

      {/* KPI 列 */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="在途中筆數"
          value={stats.inTransitCount.toLocaleString()}
          tone="blue"
          layout="vertical"
        />
        <KpiCard
          label="延遲件數"
          value={stats.delayedCount.toLocaleString()}
          tone={stats.delayedCount > 0 ? "red" : "gray"}
          layout="vertical"
        />
        <KpiCard
          label="今日預計到貨"
          value={stats.todayEtaCount.toLocaleString()}
          tone="amber"
          layout="vertical"
        />
        <KpiCard
          label="平均運送天數（近 30 天）"
          value={
            stats.avgTransitDays === null
              ? "—"
              : `${stats.avgTransitDays} 天`
          }
          tone="teal"
          layout="vertical"
        />
      </section>

      {/* FlowDiagram */}
      <section className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
            調撥狀態流（依當下件數）
          </h2>
          <span className="text-[11px] text-[#9A9890]">
            已驗收件數為近 30 天累計
          </span>
        </div>
        <FlowDiagram
          nodes={flowNodes}
          edges={flowEdges}
          currentNodeId={currentNode}
        />
      </section>

      {/* Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>狀態</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={inputClass}
            >
              <option value="">全部在途（in_transit + partial）</option>
              <option value="in_transit">在途</option>
              <option value="partial">部分到貨</option>
              <option value="received">已收貨</option>
              <option value="closed">已結案</option>
              <option value="cancelled">已取消</option>
              <option value="__all__">全部（含已結案）</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>來源倉</label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className={`${inputClass} min-w-[140px]`}
            >
              <option value="">全部</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>目標倉</label>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className={`${inputClass} min-w-[140px]`}
            >
              <option value="">全部</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>調撥單號</label>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilter()}
              placeholder="搜尋 TR..."
              className={`${inputClass} w-[160px]`}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>出貨日起</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className={`${inputClass} w-[150px]`}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>出貨日迄</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className={`${inputClass} w-[150px]`}
            />
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
          </div>
        </div>
      </section>

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{totalCount}</b> 筆調撥
          {totalCount > pageSize ? (
            <>
              （第 <b className="text-[#2C2C2A]">{page}</b> 頁，每頁 {pageSize}{" "}
              筆）
            </>
          ) : null}
        </span>
      </div>

      {totalCount === 0 ? (
        <section className="bg-white border border-[#EEECE6] rounded-lg p-10 text-center">
          <p className="text-[13px] text-[#9A9890]">
            沒有符合條件的調撥單
          </p>
        </section>
      ) : (
        <DataGrid
          columns={columns}
          data={rows}
          rowKey={(r) => r.id}
          persistKey="parts/operations/transfers-in-transit"
          exportFileName="transfers-in-transit"
          emptyMessage="沒有符合條件的調撥單"
          disabled={isPending}
          rowActionsWidth={180}
          rowActions={(r) => {
            const delayed = isDelayed(r);
            const meta = (r.metadata ?? {}) as Record<string, unknown>;
            const hasMetaFlag = meta.delayed === true;
            const canMarkOrClear =
              r.status === "in_transit" || r.status === "partial";
            return (
              <>
                <Link
                  href={`/parts/receipt/transfer-in/${r.id}`}
                  className="inline-flex items-center justify-center h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                >
                  檢視
                </Link>
                {canEdit && canMarkOrClear ? (
                  hasMetaFlag ? (
                    <button
                      type="button"
                      onClick={() => clearDelayed(r)}
                      disabled={isPending}
                      className="ml-1 inline-flex items-center justify-center h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                    >
                      撤延遲
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => markDelayed(r)}
                      disabled={isPending}
                      className={`ml-1 inline-flex items-center justify-center h-[26px] px-2.5 rounded text-[11.5px] disabled:opacity-50 ${
                        delayed
                          ? "bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9]"
                          : "bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                      }`}
                      title={delayed ? "ETA 已過、可標記為延遲" : "標延遲"}
                    >
                      標延遲
                    </button>
                  )
                ) : null}
              </>
            );
          }}
          rowExtraBelow={(r) =>
            expanded[r.id] ? (
              <ExpandedDetail
                row={r}
                lines={linesByTrId.get(r.id) ?? []}
              />
            ) : null
          }
          pagination={{
            page,
            pageSize,
            totalCount,
            onPageChange: goToPage,
          }}
        />
      )}

      {/* Banner */}
      {banner ? (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}
    </main>
  );
}

function ExpandedDetail({
  row,
  lines,
}: {
  row: TransferListRow;
  lines: TransferInTransitLine[];
}) {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const delayedReasonText =
    typeof meta.delayed_reason === "string" ? meta.delayed_reason : null;
  return (
    <div className="px-4 py-3 bg-[#F8F7F4] border-t border-[#EEECE6]">
      {delayedReasonText ? (
        <div className="mb-2 text-[12px] text-[#CC0000]">
          ⚠️ 延遲原因：<span className="font-medium">{delayedReasonText}</span>
        </div>
      ) : null}
      <div className="text-[11px] text-[#9A9890] mb-1.5 font-medium">
        明細品項（共 {lines.length} 行）
      </div>
      {lines.length === 0 ? (
        <p className="text-[12px] text-[#9A9890] py-2">
          這張調撥單尚未維護明細，請進「檢視」頁查看完整資料
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="text-[11px] text-[#9A9890]">
              <tr className="border-b border-[#EEECE6]">
                <th className="text-left py-1.5 px-2 w-12">#</th>
                <th className="text-left py-1.5 px-2 w-32">品號</th>
                <th className="text-left py-1.5 px-2">品名</th>
                <th className="text-right py-1.5 px-2 w-20">出貨數</th>
                <th className="text-right py-1.5 px-2 w-20">到貨數</th>
                <th className="text-right py-1.5 px-2 w-20">缺貨</th>
                <th className="text-left py-1.5 px-2 w-16">單位</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const shortage = Math.max(0, l.qty_shipped - l.qty_received);
                return (
                  <tr
                    key={`${l.tr_id}-${l.line_no}`}
                    className="border-b border-[#EEECE6] last:border-b-0"
                  >
                    <td className="py-1.5 px-2 font-mono text-[#9A9890]">
                      {l.line_no}
                    </td>
                    <td className="py-1.5 px-2 font-mono text-[#1A3A5C]">
                      {l.item_code}
                    </td>
                    <td className="py-1.5 px-2 text-[#2C2C2A]">
                      {l.item_name}
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono">
                      {l.qty_shipped.toLocaleString()}
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono">
                      {l.qty_received.toLocaleString()}
                    </td>
                    <td
                      className={`py-1.5 px-2 text-right font-mono ${shortage > 0 ? "text-[#CC0000] font-semibold" : "text-[#9A9890]"}`}
                    >
                      {shortage.toLocaleString()}
                    </td>
                    <td className="py-1.5 px-2 text-[#5A5955]">
                      {l.uom ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
