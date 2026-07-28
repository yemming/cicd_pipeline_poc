"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import type {
  TransferListRow,
  TransferOutKpis,
  WarehouseOption,
} from "@/domain/transfers";
import { cancelTransfer } from "@/domain/transfers";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { KpiCard } from "@/components/visualization/KpiCard";

type Banner = { ok: boolean; msg: string } | null;

const STATUS_LABEL: Record<string, { label: string; chip: string }> = {
  draft: { label: "待核准", chip: "bg-[#FDF3E3] text-[#854F0B]" },
  in_transit: { label: "在途", chip: "bg-[#FDF3E3] text-[#854F0B]" },
  partial: { label: "部分收貨", chip: "bg-[#FDF3E3] text-[#854F0B]" },
  received: { label: "已收貨", chip: "bg-[#EAF3DE] text-[#3B6D11]" },
  closed: { label: "已結案", chip: "bg-[#F2F2F2] text-[#6B6A68]" },
  cancelled: { label: "已取消", chip: "bg-[#FDECEA] text-[#CC0000]" },
};

const STATUS_OPTIONS = [
  { value: "", label: "全部" },
  { value: "draft", label: "待核准" },
  { value: "in_transit", label: "在途" },
  { value: "partial", label: "部分收貨" },
  { value: "received", label: "已收貨" },
  { value: "cancelled", label: "已取消" },
];

const TYPE_LABEL: Record<string, string> = {
  inter_store: "店間調撥",
  intra_store: "店內調撥",
  warranty_to_temp: "保固轉暫存",
  consignment_to_main: "寄銷轉自有",
};

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none";
const labelClass = "text-[11px] text-[#9A9890] font-medium";

function fmtDate(d: string | null): string {
  return d ? d.replace(/-/g, "/") : "—";
}

function fmtMoneyShort(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString("en-US");
}

function isDelayed(r: TransferListRow): boolean {
  const meta = (r.metadata ?? {}) as Record<string, unknown>;
  if (meta.delayed === true) return true;
  const today = new Date().toISOString().slice(0, 10);
  if (
    r.expected_arrival_date &&
    r.expected_arrival_date < today &&
    (r.status === "in_transit" || r.status === "partial")
  ) {
    return true;
  }
  return false;
}

export function TransferOutBoard({
  rows,
  total,
  kpis,
  warehouses,
  canEdit,
  loadError,
  filter,
  pagination,
}: {
  rows: TransferListRow[];
  total: number;
  kpis: TransferOutKpis;
  warehouses: WarehouseOption[];
  canEdit: boolean;
  loadError: string | null;
  filter: {
    q: string;
    status: string;
    source_warehouse_id: string;
    target_warehouse_id: string;
    date_from: string;
    date_to: string;
  };
  pagination: { page: number; pageSize: number; totalCount: number };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [cancelModal, setCancelModal] = useState<{
    id: string;
    tr_no: string;
  } | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const [q, setQ] = useState(filter.q);
  const [status, setStatus] = useState(filter.status);
  const [sourceWh, setSourceWh] = useState(filter.source_warehouse_id);
  const [targetWh, setTargetWh] = useState(filter.target_warehouse_id);
  const [dateFrom, setDateFrom] = useState(filter.date_from);
  const [dateTo, setDateTo] = useState(filter.date_to);

  function flash(b: Banner) {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  }

  function buildParams(opts: { keepPage?: number } = {}): URLSearchParams {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (status) params.set("status", status);
    if (sourceWh) params.set("source_warehouse_id", sourceWh);
    if (targetWh) params.set("target_warehouse_id", targetWh);
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    if (opts.keepPage && opts.keepPage > 1)
      params.set("page", String(opts.keepPage));
    return params;
  }

  function pushWith(params: URLSearchParams) {
    startTransition(() => {
      router.push(
        `/parts/issue/transfer-out${params.toString() ? `?${params.toString()}` : ""}`,
      );
    });
  }

  function applyFilters() {
    pushWith(buildParams());
  }

  function resetFilters() {
    setQ("");
    setStatus("");
    setSourceWh("");
    setTargetWh("");
    setDateFrom("");
    setDateTo("");
    pushWith(new URLSearchParams());
  }

  function goToPage(next: number) {
    pushWith(buildParams({ keepPage: next }));
  }

  function confirmCancel() {
    if (!cancelModal) return;
    const reason = cancelReason.trim();
    if (!reason) {
      flash({ ok: false, msg: "請填寫取消原因" });
      return;
    }
    startTransition(async () => {
      const res = await cancelTransfer(cancelModal.id, reason);
      if (res.ok) {
        flash({ ok: true, msg: `✓ 已取消 ${cancelModal.tr_no}` });
        setCancelModal(null);
        setCancelReason("");
        router.refresh();
      } else {
        flash({ ok: false, msg: `取消失敗：${res.error}` });
      }
    });
  }

  const columns: DataGridColumn<TransferListRow>[] = useMemo(
    () => [
      {
        id: "tr_no",
        header: "調撥單號",
        width: 150,
        hideable: false,
        cell: (r) => (
          <Link
            href={`/parts/issue/transfer-out/${r.id}`}
            className="font-mono font-semibold text-[12px] text-[#1A3A5C] hover:underline"
          >
            {r.tr_no ?? "—"}
          </Link>
        ),
        exportValue: (r) => r.tr_no ?? "",
        sortValue: (r) => r.tr_no ?? "",
      },
      {
        id: "source_warehouse_name",
        header: "來源倉",
        width: 140,
        cell: (r) => (
          <span className="text-[12.5px] px-1.5 py-0.5 rounded-md bg-[#EEF4FB] text-[#185FA5] whitespace-nowrap inline-block">
            {r.source_warehouse_name ?? "—"}
          </span>
        ),
        exportValue: (r) => r.source_warehouse_name ?? "",
        sortValue: (r) => r.source_warehouse_name ?? "",
      },
      {
        id: "arrow",
        header: "",
        width: 30,
        sortable: false,
        hideable: false,
        cell: () => <span className="text-[#9A9890] text-[12px]">→</span>,
        exportValue: () => "→",
      },
      {
        id: "target_warehouse_name",
        header: "目標倉",
        width: 140,
        cell: (r) => (
          <span className="text-[12.5px]">{r.target_warehouse_name ?? "—"}</span>
        ),
        exportValue: (r) => r.target_warehouse_name ?? "",
        sortValue: (r) => r.target_warehouse_name ?? "",
      },
      {
        id: "transfer_type",
        header: "類型",
        width: 110,
        cell: (r) => (
          <span className="text-[12px]">
            {TYPE_LABEL[r.transfer_type ?? ""] ?? r.transfer_type ?? "—"}
          </span>
        ),
        exportValue: (r) =>
          TYPE_LABEL[r.transfer_type ?? ""] ?? r.transfer_type ?? "",
        sortValue: (r) => r.transfer_type ?? "",
      },
      {
        id: "ship_date",
        header: "出貨日",
        width: 100,
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
          const delayed = isDelayed(r);
          return (
            <span
              className={`font-mono text-[12px] ${delayed ? "text-[#CC0000] font-semibold" : ""}`}
              title={delayed ? "已逾期" : ""}
            >
              {fmtDate(r.expected_arrival_date)}
              {delayed ? " ⚠" : ""}
            </span>
          );
        },
        exportValue: (r) => r.expected_arrival_date ?? "",
        sortValue: (r) => r.expected_arrival_date ?? "",
      },
      {
        id: "qty_req_shipped",
        header: "申請/出貨",
        width: 110,
        align: "right",
        sortable: false,
        cell: (r) => (
          <span className="font-mono text-[12px]">
            {r.qty_requested_total ?? 0} / {r.qty_shipped_total ?? 0}
          </span>
        ),
        exportValue: (r) =>
          `${r.qty_requested_total ?? 0} / ${r.qty_shipped_total ?? 0}`,
      },
      {
        id: "qty_received_total",
        header: "對方收貨",
        width: 90,
        align: "right",
        cell: (r) => (
          <span className="font-mono text-[12px]">
            {r.qty_received_total ?? 0}
          </span>
        ),
        exportValue: (r) => r.qty_received_total ?? 0,
        sortValue: (r) => Number(r.qty_received_total ?? 0),
        defaultHidden: true,
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
        id: "logistics",
        header: "物流",
        width: 140,
        defaultHidden: true,
        cell: (r) => (
          <span className="text-[12px] text-[#5A5955]">
            {r.logistics_provider ?? "—"}
            {r.logistics_tracking_no ? (
              <span className="font-mono text-[11px] text-[#9A9890] ml-1">
                {r.logistics_tracking_no}
              </span>
            ) : null}
          </span>
        ),
        exportValue: (r) =>
          [r.logistics_provider ?? "", r.logistics_tracking_no ?? ""]
            .filter(Boolean)
            .join(" "),
        sortValue: (r) => r.logistics_provider ?? "",
      },
      {
        id: "reason",
        header: "原因",
        width: 200,
        cell: (r) => (
          <span className="text-[12px] text-[#5A5955] truncate inline-block max-w-[220px]">
            {r.reason ?? "—"}
          </span>
        ),
        exportValue: (r) => r.reason ?? "",
        sortValue: (r) => r.reason ?? "",
      },
    ],
    [],
  );

  const canCancel = (s: string | null) =>
    s === "draft" || s === "in_transit" || s === "partial";

  const isPending = pending;

  return (
    <main
      className={`px-6 py-5 space-y-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}
    >
      {/* 1. Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">調撥出庫</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          M04U-21
        </span>
        <span className="text-[12px] text-[#9A9890]">
          建立調撥單、從本倉出貨給其他倉、跟蹤在途與對方收貨進度
        </span>
      </header>

      {/* 2. Cross-link banner — 出貨方視角，連到入庫端 */}
      <div className="bg-[#EEEDFE] border border-[#AFA9EC] rounded-md px-4 py-2.5 text-[12px] text-[#26215C] flex items-center justify-between gap-2.5 flex-wrap">
        <div>
          🔗 出貨後庫存狀態 available → in_transit；對方收貨會在「調撥入庫」確認。在途調撥可在「在途調撥」總覽看跨倉概覽。
        </div>
        <div className="flex gap-1.5">
          <Link
            href="/parts/receipt/transfer-in"
            className="h-[28px] px-3 inline-flex items-center rounded text-[11.5px] font-medium bg-[#534AB7] text-white hover:bg-[#3F379B]"
          >
            → 調撥入庫
          </Link>
          <Link
            href="/parts/operations/transfers-in-transit"
            className="h-[28px] px-3 inline-flex items-center rounded text-[11.5px] font-medium bg-white border border-[#AFA9EC] text-[#534AB7] hover:bg-[#F4F2FF]"
          >
            在途調撥
          </Link>
        </div>
      </div>

      {/* 3. Banner */}
      {banner ? (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-[110] ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}
      {loadError ? (
        <div className="px-4 py-2 rounded bg-[#FDECEA] text-[#CC0000] text-[12.5px] border border-[#F5AEAD]">
          載入失敗：{loadError}
        </div>
      ) : null}

      {/* 4. KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
        <KpiCard
          label="今日已出貨"
          value={kpis.todayShippedCount}
          tone="blue"
          layout="vertical"
        />
        <KpiCard
          label="在途中"
          value={kpis.inTransitCount}
          tone="amber"
          layout="vertical"
        />
        <KpiCard
          label="部分收貨"
          value={kpis.partialCount}
          tone="purple"
          layout="vertical"
        />
        <KpiCard
          label="近 30 日已取消"
          value={kpis.cancelledRecentCount}
          tone={kpis.cancelledRecentCount > 0 ? "red" : "gray"}
          layout="vertical"
        />
        <KpiCard
          label="近 30 日出貨"
          value={
            kpis.totalAmountShippedRecent > 0
              ? `${kpis.shippedRecentCount} (NT$${fmtMoneyShort(kpis.totalAmountShippedRecent)})`
              : kpis.shippedRecentCount
          }
          tone="teal"
          layout="vertical"
        />
      </div>

      {/* 5. Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>關鍵字</label>
            <input
              className={inputClass}
              style={{ width: 180 }}
              placeholder="調撥單號"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilters()}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>狀態</label>
            <select
              className={inputClass}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>來源倉</label>
            <select
              className={inputClass}
              style={{ minWidth: 140 }}
              value={sourceWh}
              onChange={(e) => setSourceWh(e.target.value)}
            >
              <option value="">全部</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code ? `${w.code} ` : ""}
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>目標倉</label>
            <select
              className={inputClass}
              style={{ minWidth: 140 }}
              value={targetWh}
              onChange={(e) => setTargetWh(e.target.value)}
            >
              <option value="">全部</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code ? `${w.code} ` : ""}
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>出貨日期</label>
            <div className="flex gap-1 items-center">
              <input
                type="date"
                className={inputClass}
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
              <span className="text-[#9A9890]">~</span>
              <input
                type="date"
                className={inputClass}
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={applyFilters}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "查詢中⋯" : "查詢"}
            </button>
            <button
              type="button"
              onClick={resetFilters}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
            <Link
              href="/parts/issue/transfer-out/new"
              className={`h-[30px] px-3 rounded text-[12.5px] font-medium inline-flex items-center ${
                canEdit
                  ? "bg-[#0F6E56] text-white hover:bg-[#0a5742]"
                  : "bg-[#0F6E56] text-white opacity-60 pointer-events-none"
              }`}
              title={canEdit ? "" : "沒有建立調撥的權限"}
            >
              ＋ 新增調撥
            </Link>
          </div>
        </div>
      </section>

      {/* 6. Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{total}</b> 筆調撥單（顯示{" "}
          <b className="text-[#2C2C2A]">{rows.length}</b> 筆）
        </span>
        {kpis.totalAmountShippedRecent > 0 ? (
          <span className="ml-auto text-[12px] text-[#9A9890]">
            近 30 日已出貨金額：
            <b className="text-[#1A3A5C] font-mono">
              NT$ {fmtMoneyShort(kpis.totalAmountShippedRecent)}
            </b>
          </span>
        ) : null}
      </div>

      {/* 7. Table */}
      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="parts/issue/transfer-out"
        exportFileName="transfer-out"
        emptyMessage="沒有符合條件的調撥單"
        disabled={isPending}
        rowActionsWidth={180}
        rowActions={(r) => (
          <div className="flex gap-1">
            <Link
              href={`/parts/issue/transfer-out/${r.id}`}
              className="h-[26px] px-2.5 inline-flex items-center rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              詳細
            </Link>
            {canEdit && canCancel(r.status) ? (
              <button
                type="button"
                onClick={() => {
                  setCancelModal({ id: r.id, tr_no: r.tr_no ?? "—" });
                  setCancelReason("");
                }}
                className="h-[26px] px-2.5 rounded bg-[#FDECEA] border border-[#F5AEAD] text-[11.5px] text-[#CC0000] hover:bg-[#fbdcd9]"
              >
                取消
              </button>
            ) : null}
          </div>
        )}
        pagination={{
          page: pagination.page,
          pageSize: pagination.pageSize,
          totalCount: pagination.totalCount,
          onPageChange: goToPage,
        }}
      />

      {!canEdit ? (
        <div className="text-[11px] text-[#9A9890]">
          💡 你目前沒有調撥建立 / 取消權限（parts.transfer.create），僅能檢視
        </div>
      ) : null}

      {/* Cancel Modal */}
      {cancelModal ? (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100]"
          onClick={() => !isPending && setCancelModal(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-[440px] max-w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="px-4 py-3 border-b border-[#EEECE6]">
              <h3 className="text-[14px] font-semibold text-[#2C2C2A]">
                取消調撥單 {cancelModal.tr_no}
              </h3>
            </header>
            <div className="px-4 py-4 space-y-3">
              <p className="text-[12.5px] text-[#5A5955] leading-relaxed">
                取消後在途庫存（in_transit）會搬回來源倉並翻 <b>available</b>。
              </p>
              <div>
                <label className="text-[11px] text-[#9A9890] font-medium block mb-1">
                  取消原因 <span className="text-[#CC0000]">*</span>
                </label>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  rows={3}
                  placeholder="例如：來源倉誤判庫存、目標倉拒收⋯"
                  className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none"
                  autoFocus
                />
              </div>
            </div>
            <footer className="px-4 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelModal(null)}
                disabled={isPending}
                className="h-[30px] px-3 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                關閉
              </button>
              <button
                type="button"
                onClick={confirmCancel}
                disabled={isPending || !cancelReason.trim()}
                className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#CC0000] text-white hover:bg-[#A30000] disabled:opacity-50"
              >
                {isPending ? "取消中⋯" : "確認取消"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </main>
  );
}
