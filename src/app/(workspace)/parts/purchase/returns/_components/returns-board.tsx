"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";

import {
  addPurchaseReturn,
  approvePurchaseReturn,
  completePurchaseReturn,
  deletePurchaseReturn,
  getPurchaseOrderLinesForReturn,
  shipPurchaseReturn,
  type AddPurchaseReturnInput,
  type POLineForReturn,
  type PurchaseReturnRowExpanded,
  type PurchaseReturnKpis,
  type VendorOption,
  type POOption,
} from "@/domain/procurement";
import { RETURN_REASONS, RETURN_STATUSES, fmtDateTime } from "@/domain/procurement.constants";

type Banner = { ok: boolean; msg: string } | null;

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none";
const labelClass = "text-[11px] text-[#9A9890] font-medium";

function fmtNT(n: number | null | undefined): string {
  if (n == null) return "—";
  return `NT$ ${Math.round(Number(n)).toLocaleString("en-US")}`;
}

function fmtNTShort(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(0)}K`;
  return n.toLocaleString("en-US");
}

function statusChip(status: string) {
  const def = RETURN_STATUSES.find((s) => s.value === status);
  if (!def)
    return (
      <span className="px-1.5 py-0.5 text-[11px] rounded-md bg-[#F2F2F2] text-[#6B6A68] whitespace-nowrap">
        {status}
      </span>
    );
  const cls =
    def.chip === "pend"
      ? "bg-[#FDF3E3] text-[#854F0B]"
      : def.chip === "navy"
        ? "bg-[#EBF3FF] text-[#1A3A5C]"
        : def.chip === "done"
          ? "bg-[#EAF3DE] text-[#3B6D11]"
          : def.chip === "teal"
            ? "bg-[#E8F5F0] text-[#0F6E56]"
            : "bg-[#F2F2F2] text-[#6B6A68]";
  return (
    <span className={`px-1.5 py-0.5 text-[11px] rounded-md whitespace-nowrap ${cls}`}>
      {def.label}
    </span>
  );
}

function reasonLabel(value: string) {
  return RETURN_REASONS.find((r) => r.value === value)?.label ?? value;
}

export function ReturnsBoard({
  rows,
  total,
  kpis,
  vendors,
  poOptions,
  canEdit,
  canApprove,
  filter,
  loadError,
  autoOpenCreate,
}: {
  rows: PurchaseReturnRowExpanded[];
  total: number;
  kpis: PurchaseReturnKpis;
  vendors: VendorOption[];
  poOptions: POOption[];
  canEdit: boolean;
  canApprove: boolean;
  filter: {
    status: string;
    vendor_id: string;
    return_reason: string;
    date_from: string;
    date_to: string;
    q: string;
  };
  loadError: string | null;
  autoOpenCreate: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [showCreate, setShowCreate] = useState(autoOpenCreate);
  const [shipForId, setShipForId] = useState<string | null>(null);
  const [completeForId, setCompleteForId] = useState<string | null>(null);
  const [deleteFor, setDeleteFor] = useState<{ id: string; rt_no: string } | null>(null);

  const [q, setQ] = useState(filter.q);
  const [status, setStatus] = useState(filter.status);
  const [vendor, setVendor] = useState(filter.vendor_id);
  const [reason, setReason] = useState(filter.return_reason);
  const [dateFrom, setDateFrom] = useState(filter.date_from);
  const [dateTo, setDateTo] = useState(filter.date_to);

  function showBanner(ok: boolean, msg: string) {
    setBanner({ ok, msg });
    if (ok) setTimeout(() => setBanner(null), 2200);
  }

  function applyFilters() {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (status !== "all") params.set("status", status);
    if (vendor) params.set("vendor_id", vendor);
    if (reason !== "all") params.set("return_reason", reason);
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    startTransition(() => {
      router.push(`/parts/purchase/returns${params.toString() ? `?${params.toString()}` : ""}`);
    });
  }
  function resetFilters() {
    setQ("");
    setStatus("all");
    setVendor("");
    setReason("all");
    setDateFrom("");
    setDateTo("");
    startTransition(() => router.push("/parts/purchase/returns"));
  }

  function handleApprove(id: string, rt_no: string) {
    startTransition(async () => {
      const res = await approvePurchaseReturn(id);
      if (res.ok) {
        showBanner(true, `✓ ${rt_no} 已審核 · 庫存已回沖`);
        router.refresh();
      } else {
        showBanner(false, `審核失敗：${res.error}`);
      }
    });
  }

  function handleDelete(id: string, rt_no: string) {
    setDeleteFor({ id, rt_no });
  }
  function confirmDelete() {
    if (!deleteFor) return;
    const { id, rt_no } = deleteFor;
    startTransition(async () => {
      const res = await deletePurchaseReturn(id);
      if (res.ok) {
        showBanner(true, `✓ ${rt_no} 已刪除`);
        setDeleteFor(null);
        router.refresh();
      } else {
        showBanner(false, `刪除失敗：${res.error}`);
        setDeleteFor(null);
      }
    });
  }

  const columns: DataGridColumn<PurchaseReturnRowExpanded>[] = useMemo(
    () => [
      {
        id: "rt_no",
        header: "退貨單號",
        width: 170,
        hideable: false,
        cell: (r) => (
          <Link
            href={`/parts/purchase/returns/${r.id}`}
            className="font-mono font-semibold text-[#1A3A5C] hover:text-[#185FA5]"
          >
            {r.rt_no}
          </Link>
        ),
        exportValue: (r) => r.rt_no,
        sortValue: (r) => r.rt_no,
      },
      {
        id: "po_no",
        header: "原採購單號",
        width: 160,
        cell: (r) =>
          r.po ? (
            <span className="font-mono text-[#185FA5]">{r.po.po_no}</span>
          ) : (
            <span className="text-[#9A9890]">—</span>
          ),
        exportValue: (r) => r.po?.po_no ?? "",
      },
      {
        id: "vendor",
        header: "供應商",
        width: 160,
        cell: (r) => r.vendor?.name ?? "—",
        exportValue: (r) => r.vendor?.name ?? "",
        sortValue: (r) => r.vendor?.name ?? "",
      },
      {
        id: "return_reason",
        header: "退貨原因",
        width: 130,
        cell: (r) => (
          <span className="px-1.5 py-0.5 text-[11px] rounded-md bg-[#EAF4FB] text-[#185FA5]">
            {reasonLabel(r.return_reason)}
          </span>
        ),
        exportValue: (r) => reasonLabel(r.return_reason),
        sortValue: (r) => r.return_reason,
      },
      {
        id: "qty",
        header: "退貨件數",
        width: 90,
        align: "right",
        cell: (r) => <span className="font-mono">{Number(r.qty_return_total ?? 0).toLocaleString("en-US")}</span>,
        exportValue: (r) => String(r.qty_return_total ?? 0),
        sortValue: (r) => Number(r.qty_return_total ?? 0),
      },
      {
        id: "amount",
        header: "退貨金額",
        width: 130,
        align: "right",
        cell: (r) => <span className="font-mono">{fmtNT(Number(r.amount_total ?? 0))}</span>,
        exportValue: (r) => String(r.amount_total ?? 0),
        sortValue: (r) => Number(r.amount_total ?? 0),
      },
      {
        id: "applied_at",
        header: "申請時間",
        width: 140,
        cell: (r) => (
          <span className="font-mono text-[11.5px]">{fmtDateTime(r.created_at)}</span>
        ),
        exportValue: (r) => r.created_at ?? "",
        sortValue: (r) => r.created_at ?? "",
      },
      {
        id: "status",
        header: "狀態",
        width: 90,
        cell: (r) => statusChip(r.status),
        exportValue: (r) => RETURN_STATUSES.find((s) => s.value === r.status)?.label ?? r.status,
        sortValue: (r) => r.status,
      },
    ],
    [],
  );

  return (
    <main className="px-6 py-5 space-y-3">
      {/* 1. Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">採購退貨</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          4.5
        </span>
        <span className="text-[12px] text-[#9A9890]">
          對已入庫備件發起退貨・庫存自動回沖・退款追蹤
        </span>
      </header>

      {/* 2. Banner */}
      {loadError && (
        <div className="px-4 py-2 rounded bg-[#FDECEA] text-[#CC0000] text-[12.5px] border border-[#F5AEAD]">
          載入失敗：{loadError}
        </div>
      )}

      {/* 3. KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <KpiCard
          label="待處理退貨"
          value={kpis.pending_count}
          unit="筆退貨申請"
          color="#854F0B"
        />
        <KpiCard
          label="退貨中（物流）"
          value={kpis.shipped_count}
          unit="筆已寄出"
          color="#185FA5"
        />
        <KpiCard
          label="本月已完成退貨"
          value={kpis.completed_this_month}
          unit="筆退貨完成"
          color="#0F6E56"
        />
        <KpiCard
          label="本月退貨金額"
          value={kpis.amount_this_month}
          unit={`NT$ ${Math.round(kpis.amount_this_month).toLocaleString("en-US")}`}
          color="#1A3A5C"
          isAmount
        />
      </div>

      {/* 4. Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>關鍵字</label>
            <input
              className={inputClass}
              style={{ width: 180 }}
              placeholder="退貨單號"
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
              <option value="all">全部</option>
              {RETURN_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>供應商</label>
            <select
              className={inputClass}
              style={{ minWidth: 140 }}
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
            >
              <option value="">全部</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>退貨原因</label>
            <select
              className={inputClass}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              <option value="all">全部</option>
              {RETURN_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>退貨日期</label>
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
              disabled={pending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {pending ? "查詢中⋯" : "查詢"}
            </button>
            <button
              type="button"
              onClick={resetFilters}
              disabled={pending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                disabled={pending}
                className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
              >
                ＋ 新增退貨申請
              </button>
            )}
          </div>
        </div>
      </section>

      {/* 5. Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{total}</b> 筆退貨單（顯示 <b>{rows.length}</b> 筆）
        </span>
      </div>

      {/* 6. Table */}
      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="parts/purchase/returns"
        exportFileName="purchase-returns"
        emptyMessage="沒有符合條件的退貨單"
        disabled={pending}
        rowActionsWidth={230}
        rowActions={(r) => {
          const s = r.status;
          if (s === "pending") {
            return (
              <>
                {canApprove && (
                  <button
                    onClick={() => handleApprove(r.id, r.rt_no)}
                    className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#0F6E56] text-white hover:bg-[#0a5742]"
                  >
                    審核
                  </button>
                )}
                <Link
                  href={`/parts/purchase/returns/${r.id}`}
                  className="h-[26px] inline-flex items-center px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                >
                  編輯
                </Link>
                {canEdit && (
                  <button
                    onClick={() => handleDelete(r.id, r.rt_no)}
                    className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9]"
                  >
                    刪除
                  </button>
                )}
              </>
            );
          }
          if (s === "approved") {
            return (
              <>
                {canEdit && (
                  <button
                    onClick={() => setShipForId(r.id)}
                    className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#1A3A5C] text-white hover:bg-[#0F2A45]"
                  >
                    填物流
                  </button>
                )}
                <Link
                  href={`/parts/purchase/returns/${r.id}`}
                  className="h-[26px] inline-flex items-center px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955]"
                >
                  查看
                </Link>
              </>
            );
          }
          if (s === "shipped") {
            return (
              <>
                {canEdit && (
                  <button
                    onClick={() => setCompleteForId(r.id)}
                    className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#0F6E56] text-white hover:bg-[#0a5742]"
                  >
                    標完成
                  </button>
                )}
                <Link
                  href={`/parts/purchase/returns/${r.id}`}
                  className="h-[26px] inline-flex items-center px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955]"
                >
                  物流
                </Link>
              </>
            );
          }
          return (
            <Link
              href={`/parts/purchase/returns/${r.id}`}
              className="h-[26px] inline-flex items-center px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955]"
            >
              查看
            </Link>
          );
        }}
      />

      {/* Create Modal */}
      {showCreate && (
        <CreateReturnModal
          poOptions={poOptions}
          onClose={() => setShowCreate(false)}
          onSuccess={(rt_no) => {
            showBanner(true, `✓ 退貨申請 ${rt_no} 已建立`);
            setShowCreate(false);
            router.refresh();
          }}
          onError={(msg) => showBanner(false, `建立失敗：${msg}`)}
        />
      )}

      {/* Ship Modal */}
      {shipForId && (
        <ShipModal
          rtId={shipForId}
          onClose={() => setShipForId(null)}
          onSuccess={() => {
            showBanner(true, "✓ 物流資訊已填");
            setShipForId(null);
            router.refresh();
          }}
          onError={(msg) => showBanner(false, `填物流失敗：${msg}`)}
        />
      )}

      {/* Complete Modal */}
      {completeForId && (
        <CompleteModal
          rtId={completeForId}
          onClose={() => setCompleteForId(null)}
          onSuccess={() => {
            showBanner(true, "✓ 退貨單已標記完成");
            setCompleteForId(null);
            router.refresh();
          }}
          onError={(msg) => showBanner(false, `標完成失敗：${msg}`)}
        />
      )}

      {/* Delete confirm Modal */}
      {deleteFor && (
        <div className="fixed inset-0 z-[100] bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-[400px]">
            <header className="px-4 py-3 border-b border-[#EEECE6]">
              <h3 className="text-[14px] font-semibold text-[#CC0000]">確認刪除退貨單</h3>
            </header>
            <div className="px-4 py-3 text-[12.5px] text-[#2C2C2A]">
              確定要刪除 <b className="font-mono">{deleteFor.rt_no}</b>？此動作無法復原。
            </div>
            <footer className="px-4 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteFor(null)}
                disabled={pending}
                className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={pending}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-60"
              >
                {pending ? "刪除中⋯" : "確認刪除"}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Banner */}
      {banner && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-[110] ${
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

// ──────────────────────────────────────────────────────────────────────────
// KPI Card
// ──────────────────────────────────────────────────────────────────────────
function KpiCard({
  label,
  value,
  unit,
  color,
  isAmount,
}: {
  label: string;
  value: number;
  unit: string;
  color: string;
  isAmount?: boolean;
}) {
  return (
    <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
      <div className="text-[11px] text-[#9A9890]">{label}</div>
      <div className="font-mono font-semibold my-1" style={{ color, fontSize: isAmount ? 22 : 24 }}>
        {isAmount ? fmtNTShort(value) : value}
      </div>
      <div className="text-[11px] text-[#9A9890]">{unit}</div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Create Return Modal — PO 連動 → 自動帶 lines
// ──────────────────────────────────────────────────────────────────────────
function CreateReturnModal({
  poOptions,
  onClose,
  onSuccess,
  onError,
}: {
  poOptions: POOption[];
  onClose: () => void;
  onSuccess: (rt_no: string) => void;
  onError: (msg: string) => void;
}) {
  const [poId, setPoId] = useState<string>("");
  const [returnReason, setReturnReason] = useState<string>("spec_mismatch");
  const [notes, setNotes] = useState<string>("");
  const [poLines, setPoLines] = useState<POLineForReturn[]>([]);
  const [loadingLines, setLoadingLines] = useState(false);
  const [selectedLines, setSelectedLines] = useState<Map<string, { qty: number; serials: string }>>(
    new Map(),
  );
  const [submitting, startSubmit] = useTransition();

  const selectedPo = poOptions.find((p) => p.id === poId);

  useEffect(() => {
    if (!poId) return;
    let cancelled = false;
    const run = async () => {
      setLoadingLines(true);
      try {
        const lines = await getPurchaseOrderLinesForReturn(poId);
        if (cancelled) return;
        setPoLines(lines);
        setSelectedLines(new Map());
      } catch (e) {
        if (!cancelled) onError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoadingLines(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [poId, onError]);

  function handlePoChange(newPoId: string) {
    setPoId(newPoId);
    if (!newPoId) {
      setPoLines([]);
      setSelectedLines(new Map());
    }
  }

  function toggleLine(line: POLineForReturn) {
    const next = new Map(selectedLines);
    if (next.has(line.id)) {
      next.delete(line.id);
    } else {
      next.set(line.id, { qty: line.qty_returnable > 0 ? 1 : 0, serials: "" });
    }
    setSelectedLines(next);
  }

  function setLineQty(lineId: string, qty: number) {
    const next = new Map(selectedLines);
    const cur = next.get(lineId);
    if (!cur) return;
    next.set(lineId, { ...cur, qty });
    setSelectedLines(next);
  }
  function setLineSerials(lineId: string, serials: string) {
    const next = new Map(selectedLines);
    const cur = next.get(lineId);
    if (!cur) return;
    next.set(lineId, { ...cur, serials });
    setSelectedLines(next);
  }

  function submit() {
    if (!selectedPo) return onError("請選擇原採購單");
    if (selectedLines.size === 0) return onError("請至少勾選一筆退貨明細");

    const lines: AddPurchaseReturnInput["lines"] = [];
    for (const [lineId, sel] of selectedLines.entries()) {
      const po = poLines.find((l) => l.id === lineId);
      if (!po) continue;
      if (sel.qty <= 0) return onError(`${po.item_code} 退貨數量必須大於 0`);
      if (sel.qty > po.qty_returnable)
        return onError(`${po.item_code} 退貨數 ${sel.qty} 超過可退數 ${po.qty_returnable}`);
      const serials = sel.serials
        .split(/[,，\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (po.serial_required && serials.length !== sel.qty) {
        return onError(
          `${po.item_code} 需指定序號（需 ${sel.qty} 個、實際 ${serials.length}）`,
        );
      }
      lines.push({
        po_line_id: po.id,
        item_id: po.item_id,
        qty_return: sel.qty,
        unit_price: po.unit_price,
        selected_serial_nos: serials,
      });
    }

    startSubmit(async () => {
      const res = await addPurchaseReturn({
        po_id: selectedPo.id,
        warehouse_id: selectedPo.warehouse_id,
        return_reason: returnReason,
        notes: notes || null,
        lines,
      });
      if (res.ok) onSuccess(res.data.rt_no);
      else onError(res.error);
    });
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-40 flex items-start justify-center pt-16"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white w-[680px] max-h-[80vh] overflow-y-auto rounded-lg shadow-2xl">
        <header className="px-5 py-3 border-b border-[#EEECE6] flex items-center justify-between">
          <h2 className="text-[14px] font-semibold">新增採購退貨申請</h2>
          <button onClick={onClose} className="text-[#9A9890] hover:text-[#5A5955]">
            ✕
          </button>
        </header>
        <div className="px-5 py-4 space-y-3">
          <div className="text-[12px] text-[#9A9890]">
            填寫退貨資訊，<b className="text-[#854F0B]">必須綁原採購單</b>，審核通過後庫存自動回沖
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>選擇原採購單 *</label>
            <select
              className={inputClass}
              value={poId}
              onChange={(e) => handlePoChange(e.target.value)}
              disabled={submitting}
            >
              <option value="">— 請選 —</option>
              {poOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.po_no}（{p.vendor_name}・{p.po_date}・{fmtNT(p.amount_total)}）
                </option>
              ))}
            </select>
            {poOptions.length === 0 && (
              <div className="text-[11px] text-[#CC0000]">無可退貨採購單（須有已入庫紀錄）</div>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>退貨原因 *</label>
            <select
              className={inputClass}
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              disabled={submitting}
            >
              {RETURN_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {poId && (
            <div className="flex flex-col gap-1">
              <label className={labelClass}>備件明細（勾選 + 填退貨數）*</label>
              <div className="bg-[#F8F7F4] border border-[#EEECE6] rounded-md max-h-[260px] overflow-y-auto">
                {loadingLines ? (
                  <div className="px-3 py-4 text-[12px] text-[#9A9890]">載入採購單明細⋯</div>
                ) : poLines.length === 0 ? (
                  <div className="px-3 py-4 text-[12px] text-[#9A9890]">此採購單沒有明細</div>
                ) : (
                  poLines.map((ln) => {
                    const sel = selectedLines.get(ln.id);
                    const checked = !!sel;
                    return (
                      <div
                        key={ln.id}
                        className={`px-3 py-2 border-b border-[#EEECE6] last:border-b-0 ${
                          ln.qty_returnable <= 0 ? "opacity-50" : ""
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={ln.qty_returnable <= 0 || submitting}
                            onChange={() => toggleLine(ln)}
                            className="mt-1"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-[12.5px]">
                              <span className="font-mono font-semibold text-[#1A3A5C]">{ln.item_code}</span>
                              <span className="ml-2">{ln.item_name}</span>
                            </div>
                            <div className="text-[11px] text-[#9A9890] font-mono">
                              已收 {ln.qty_received} {ln.uom} ・ 已退 {ln.qty_returned} ・ 可退{" "}
                              <b className="text-[#0F6E56]">{ln.qty_returnable}</b>
                              {ln.serial_required && (
                                <span className="ml-2 px-1 py-0.5 rounded text-[10px] bg-[#FDF3E3] text-[#854F0B]">
                                  需序號
                                </span>
                              )}
                            </div>
                            {checked && (
                              <div className="mt-2 flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                  <label className="text-[11px] text-[#5A5955]">退貨數</label>
                                  <input
                                    type="number"
                                    min={1}
                                    max={ln.qty_returnable}
                                    value={sel?.qty ?? 1}
                                    onChange={(e) => setLineQty(ln.id, Number(e.target.value))}
                                    className="h-[26px] w-[80px] border border-[#D5D3CB] rounded px-2 text-[12px]"
                                    disabled={submitting}
                                  />
                                  <span className="text-[11px] text-[#9A9890] font-mono">
                                    × {fmtNT(ln.unit_price)} = {fmtNT((sel?.qty ?? 0) * ln.unit_price)}
                                  </span>
                                </div>
                                {ln.serial_required && (
                                  <div className="flex items-center gap-2">
                                    <label className="text-[11px] text-[#5A5955] whitespace-nowrap">序號（逗號 / 空格分隔）</label>
                                    <input
                                      type="text"
                                      value={sel?.serials ?? ""}
                                      onChange={(e) => setLineSerials(ln.id, e.target.value)}
                                      className="h-[26px] flex-1 border border-[#D5D3CB] rounded px-2 text-[12px] font-mono"
                                      placeholder="SN001, SN002, ..."
                                      disabled={submitting}
                                    />
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className={labelClass}>退貨說明</label>
            <textarea
              className="border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] focus:outline-none"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="請說明退貨原因與詳細情況⋯"
              disabled={submitting}
            />
          </div>
        </div>
        <footer className="px-5 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            取消
          </button>
          <button
            onClick={submit}
            disabled={submitting || !poId || selectedLines.size === 0}
            className="h-[30px] px-4 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
          >
            {submitting ? "建立中⋯" : "送出申請"}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Ship Modal
// ──────────────────────────────────────────────────────────────────────────
function ShipModal({
  rtId,
  onClose,
  onSuccess,
  onError,
}: {
  rtId: string;
  onClose: () => void;
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const [provider, setProvider] = useState("");
  const [trackingNo, setTrackingNo] = useState("");
  const [submitting, startSubmit] = useTransition();

  function submit() {
    if (!provider || !trackingNo) return onError("物流商與追蹤號必填");
    startSubmit(async () => {
      const res = await shipPurchaseReturn(rtId, {
        logistics_provider: provider,
        logistics_tracking_no: trackingNo,
      });
      if (res.ok) onSuccess();
      else onError(res.error);
    });
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-40 flex items-start justify-center pt-24"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white w-[420px] rounded-lg shadow-2xl">
        <header className="px-5 py-3 border-b border-[#EEECE6]">
          <h2 className="text-[14px] font-semibold">填寫物流資訊</h2>
        </header>
        <div className="px-5 py-4 space-y-3">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>物流商 *</label>
            <input
              className={inputClass}
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              placeholder="如：黑貓宅急便、新竹物流"
              disabled={submitting}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>追蹤號 *</label>
            <input
              className={`${inputClass} font-mono`}
              value={trackingNo}
              onChange={(e) => setTrackingNo(e.target.value)}
              placeholder="物流追蹤單號"
              disabled={submitting}
            />
          </div>
        </div>
        <footer className="px-5 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955]"
          >
            取消
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="h-[30px] px-4 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50"
          >
            {submitting ? "送出中⋯" : "確認出貨"}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Complete Modal
// ──────────────────────────────────────────────────────────────────────────
function CompleteModal({
  rtId,
  onClose,
  onSuccess,
  onError,
}: {
  rtId: string;
  onClose: () => void;
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const [refund, setRefund] = useState<string>("");
  const [submitting, startSubmit] = useTransition();

  function submit() {
    startSubmit(async () => {
      const refundNum = refund ? Number(refund) : undefined;
      const res = await completePurchaseReturn(rtId, refundNum != null ? { refund_amount: refundNum } : undefined);
      if (res.ok) onSuccess();
      else onError(res.error);
    });
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-40 flex items-start justify-center pt-24"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white w-[420px] rounded-lg shadow-2xl">
        <header className="px-5 py-3 border-b border-[#EEECE6]">
          <h2 className="text-[14px] font-semibold">標記退貨完成</h2>
        </header>
        <div className="px-5 py-4 space-y-3">
          <div className="text-[12px] text-[#9A9890]">
            可選：填寫實際退款金額（留空則用退貨單原金額）
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>實際退款金額（NT$）</label>
            <input
              type="number"
              className={`${inputClass} font-mono`}
              value={refund}
              onChange={(e) => setRefund(e.target.value)}
              placeholder="留空 = 用原退貨金額"
              disabled={submitting}
            />
          </div>
        </div>
        <footer className="px-5 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955]"
          >
            取消
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="h-[30px] px-4 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
          >
            {submitting ? "處理中⋯" : "標完成"}
          </button>
        </footer>
      </div>
    </div>
  );
}
