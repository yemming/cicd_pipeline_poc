"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { voidIssue } from "@/domain/issues";
import {
  setDeliveryStatus,
  type InternalSaleIssueKpis,
  type InternalSaleIssueRow,
  type StoreOption,
  type WarehouseOption,
} from "@/domain/internal-sale-issues";
import {
  DELIVERY_STATUS_OPTIONS,
  ISSUE_STATUS_OPTIONS,
  deliveryStatusChipClass,
  deliveryStatusLabel,
  fmtDate,
  fmtEtaDelta,
  fmtMoney,
  fmtMoneyShort,
  issueStatusChipClass,
  issueStatusLabel,
} from "@/domain/internal-sale-issues.constants";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { KpiCard } from "@/components/visualization/KpiCard";

type Banner = { ok: boolean; msg: string } | null;

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none";
const labelClass = "text-[11px] text-[#9A9890] font-medium";

export function InternalSaleBoard({
  rows,
  total,
  kpis,
  warehouses,
  destinationStores,
  filter,
  canEdit,
  loadError,
}: {
  rows: InternalSaleIssueRow[];
  total: number;
  kpis: InternalSaleIssueKpis;
  warehouses: WarehouseOption[];
  destinationStores: StoreOption[];
  filter: {
    status: string;
    delivery_status: string;
    warehouse_id: string;
    destination_store_id: string;
    q: string;
    date_from: string;
    date_to: string;
  };
  canEdit: boolean;
  loadError: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  // filter form state
  const [status, setStatus] = useState(filter.status);
  const [deliveryStatusFilter, setDeliveryStatusFilter] = useState(filter.delivery_status);
  const [warehouseId, setWarehouseId] = useState(filter.warehouse_id);
  const [destinationStoreId, setDestinationStoreId] = useState(filter.destination_store_id);
  const [q, setQ] = useState(filter.q);
  const [dateFrom, setDateFrom] = useState(filter.date_from);
  const [dateTo, setDateTo] = useState(filter.date_to);

  // modal state
  const [voidModal, setVoidModal] = useState<{ id: string; gi_no: string } | null>(null);
  const [voidReason, setVoidReason] = useState("");

  function flash(b: Banner) {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  }

  function applyFilter() {
    const params = new URLSearchParams();
    if (status && status !== "all") params.set("status", status);
    if (deliveryStatusFilter && deliveryStatusFilter !== "all") {
      params.set("delivery_status", deliveryStatusFilter);
    }
    if (warehouseId) params.set("warehouse_id", warehouseId);
    if (destinationStoreId) params.set("destination_store_id", destinationStoreId);
    if (q.trim()) params.set("q", q.trim());
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    startTransition(() =>
      router.push(
        `/parts/issue/internal-sale${params.toString() ? "?" + params : ""}`,
      ),
    );
  }
  function resetFilter() {
    setStatus("all");
    setDeliveryStatusFilter("all");
    setWarehouseId("");
    setDestinationStoreId("");
    setQ("");
    setDateFrom("");
    setDateTo("");
    startTransition(() => router.push("/parts/issue/internal-sale"));
  }

  function confirmVoid() {
    if (!voidModal) return;
    const reason = voidReason.trim();
    if (!reason) {
      flash({ ok: false, msg: "請填寫作廢原因" });
      return;
    }
    startTransition(async () => {
      const res = await voidIssue(voidModal.id, reason);
      if (res.ok) {
        flash({ ok: true, msg: `✓ 已作廢 ${voidModal.gi_no}` });
        setVoidModal(null);
        setVoidReason("");
        router.refresh();
      } else {
        flash({ ok: false, msg: `作廢失敗：${res.error}` });
      }
    });
  }

  function quickMarkDelivered(id: string, gi_no: string) {
    startTransition(async () => {
      const res = await setDeliveryStatus(id, "delivered");
      if (res.ok) {
        flash({ ok: true, msg: `✓ ${gi_no} 已標記為已送達` });
        router.refresh();
      } else {
        flash({ ok: false, msg: `更新失敗：${res.error}` });
      }
    });
  }

  const columns: DataGridColumn<InternalSaleIssueRow>[] = useMemo(
    () => [
      {
        id: "gi_no",
        header: "出貨單號",
        width: 160,
        hideable: false,
        cell: (r) => (
          <Link
            href={`/parts/issue/internal-sale/${r.id}`}
            className="font-mono font-semibold text-[12px] text-[#1A3A5C] hover:underline"
          >
            {r.gi_no}
          </Link>
        ),
        exportValue: (r) => r.gi_no,
        sortValue: (r) => r.gi_no,
      },
      {
        id: "destination_store",
        header: "收貨門店",
        width: 160,
        cell: (r) =>
          r.destination_store_name ? (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF4FB] text-[#185FA5] whitespace-nowrap">
              {r.destination_store_name}
            </span>
          ) : (
            <span className="text-[#9A9890]">—</span>
          ),
        exportValue: (r) => r.destination_store_name ?? "",
        sortValue: (r) => r.destination_store_name ?? "",
      },
      {
        id: "delivery_status",
        header: "配送狀態",
        width: 110,
        hideable: false,
        cell: (r) => (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${deliveryStatusChipClass(
              r.delivery_status,
            )}`}
          >
            {deliveryStatusLabel(r.delivery_status)}
          </span>
        ),
        exportValue: (r) => deliveryStatusLabel(r.delivery_status),
        sortValue: (r) => r.delivery_status ?? "",
      },
      {
        id: "delivery_eta_at",
        header: "預估送達",
        width: 130,
        cell: (r) =>
          r.delivery_eta_at ? (
            <span className="text-[11.5px] text-[#5A5955] font-mono">
              {fmtEtaDelta(r.delivery_eta_at)}
            </span>
          ) : (
            <span className="text-[#9A9890]">—</span>
          ),
        exportValue: (r) => r.delivery_eta_at ?? "",
        sortValue: (r) => r.delivery_eta_at ?? "",
      },
      {
        id: "recipient_name",
        header: "收件人",
        width: 110,
        cell: (r) =>
          r.recipient_name ? (
            <span className="text-[12px] text-[#2C2C2A]">{r.recipient_name}</span>
          ) : (
            <span className="text-[#9A9890]">—</span>
          ),
        exportValue: (r) => r.recipient_name ?? "",
        sortValue: (r) => r.recipient_name ?? "",
      },
      {
        id: "warehouse_name",
        header: "出庫倉",
        width: 130,
        cell: (r) => (
          <span className="text-[12.5px]">{r.warehouse_name ?? "—"}</span>
        ),
        exportValue: (r) => r.warehouse_name ?? "",
        sortValue: (r) => r.warehouse_name ?? "",
      },
      {
        id: "issue_date",
        header: "出庫日",
        width: 110,
        cell: (r) => (
          <span className="font-mono text-[12px] text-[#5A5955]">{fmtDate(r.issue_date)}</span>
        ),
        exportValue: (r) => r.issue_date,
        sortValue: (r) => r.issue_date,
      },
      {
        id: "qty_issued_total",
        header: "出貨數",
        width: 80,
        align: "right",
        cell: (r) => (
          <span className="font-mono text-[12px]">{r.qty_issued_total}</span>
        ),
        exportValue: (r) => r.qty_issued_total,
        sortValue: (r) => r.qty_issued_total,
      },
      {
        id: "amount_total",
        header: "結算金額",
        width: 120,
        align: "right",
        cell: (r) => (
          <span className="font-mono text-[12px] text-[#2C2C2A]">
            {fmtMoney(r.amount_total)}
          </span>
        ),
        exportValue: (r) => Math.round(r.amount_total),
        sortValue: (r) => r.amount_total,
      },
      {
        id: "status",
        header: "單據狀態",
        width: 100,
        hideable: false,
        cell: (r) => (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${issueStatusChipClass(
              r.status,
            )}`}
          >
            {issueStatusLabel(r.status)}
          </span>
        ),
        exportValue: (r) => issueStatusLabel(r.status),
        sortValue: (r) => r.status,
      },
      {
        id: "notes",
        header: "用途備註",
        cell: (r) => (
          <span className="text-[12px] text-[#5A5955] truncate inline-block max-w-[260px]">
            {r.notes ?? "—"}
          </span>
        ),
        exportValue: (r) => r.notes ?? "",
        sortValue: (r) => r.notes ?? "",
      },
    ],
    [],
  );

  return (
    <main className={`px-6 py-5 space-y-3 ${pending ? "pointer-events-none opacity-60" : ""}`}>
      {/* 1. Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">內售出貨</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          M04U-20
        </span>
        <span className="text-[12px] text-[#9A9890]">
          員工 / 試乘 / 內銷用途備件出庫・自定結算單價・配送 ETA 追蹤
        </span>
      </header>

      {loadError && (
        <div className="px-4 py-2 rounded bg-[#FDECEA] text-[#CC0000] text-[12.5px] border border-[#F5AEAD]">
          載入失敗：{loadError}
        </div>
      )}

      {/* 2. KPI cards（M04U-20 規格：今日出庫筆數 / 查收中 / 已送達 / 結算金額） */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <KpiCard
          label="今日出庫"
          value={kpis.todayCount}
          tone="blue"
          layout="vertical"
        />
        <KpiCard
          label="查收中"
          value={kpis.inTransitCount}
          tone="amber"
          layout="vertical"
        />
        <KpiCard
          label="已送達"
          value={kpis.deliveredCount}
          tone="green"
          layout="vertical"
        />
        <KpiCard
          label="結算金額"
          value={fmtMoneyShort(kpis.totalAmount)}
          tone="teal"
          layout="vertical"
        />
      </div>

      {/* 3. Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>單號搜尋</label>
            <input
              type="text"
              className={inputClass}
              style={{ width: 180 }}
              placeholder="ISS 編號..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilter()}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>單據狀態</label>
            <select
              className={inputClass}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {ISSUE_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>配送狀態</label>
            <select
              className={inputClass}
              value={deliveryStatusFilter}
              onChange={(e) => setDeliveryStatusFilter(e.target.value)}
            >
              {DELIVERY_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>出庫倉</label>
            <select
              className={inputClass}
              style={{ minWidth: 140 }}
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
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
            <label className={labelClass}>收貨門店</label>
            <select
              className={inputClass}
              style={{ minWidth: 140 }}
              value={destinationStoreId}
              onChange={(e) => setDestinationStoreId(e.target.value)}
            >
              <option value="">全部</option>
              {destinationStores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code ? `${s.code} ` : ""}
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>出庫日期</label>
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
              onClick={applyFilter}
              disabled={pending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {pending ? "查詢中⋯" : "查詢"}
            </button>
            <button
              type="button"
              onClick={resetFilter}
              disabled={pending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
            {canEdit && (
              <Link
                href="/parts/issue/internal-sale/new"
                className="h-[30px] px-3 inline-flex items-center rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742]"
              >
                ＋ 新增內售出貨
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* 4. Toolbar */}
      <div className="flex items-center gap-3">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{total}</b> 筆內售出庫
        </span>
        <span className="text-[12px] text-[#9A9890]">
          結算總額{" "}
          <b className="text-[#2C2C2A] font-mono">{fmtMoney(kpis.totalAmount)}</b>
        </span>
      </div>

      {/* 5. Table */}
      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="parts/issue/internal-sale"
        exportFileName="internal-sale-issues"
        emptyMessage="尚無符合條件的內售出庫單"
        disabled={pending}
        rowActionsWidth={canEdit ? 260 : 110}
        rowActions={(r) => (
          <div className="flex gap-1">
            <Link
              href={`/parts/issue/internal-sale/${r.id}`}
              className="h-[26px] px-2.5 inline-flex items-center rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              詳細
            </Link>
            {canEdit && r.status === "completed" && r.delivery_status === "in_transit" && (
              <button
                type="button"
                onClick={() => quickMarkDelivered(r.id, r.gi_no)}
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-tone-green-50 text-tone-green-700 border border-tone-green-100 hover:bg-tone-green-100"
              >
                ✓ 標記送達
              </button>
            )}
            {canEdit && r.status === "completed" && (
              <button
                type="button"
                onClick={() => {
                  setVoidModal({ id: r.id, gi_no: r.gi_no });
                  setVoidReason("");
                }}
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9]"
              >
                作廢
              </button>
            )}
          </div>
        )}
      />

      {!canEdit && (
        <div className="text-[11px] text-[#9A9890]">
          💡 你目前沒有出貨建立 / 作廢權限（parts.issue.create），僅能檢視
        </div>
      )}

      {/* Void modal */}
      {voidModal && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100]"
          onClick={() => !pending && setVoidModal(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-[440px] max-w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="px-4 py-3 border-b border-[#EEECE6]">
              <h3 className="text-[14px] font-semibold text-[#2C2C2A]">
                取消出庫 {voidModal.gi_no}
              </h3>
            </header>
            <div className="px-4 py-4 space-y-3">
              <p className="text-[12.5px] text-[#5A5955] leading-relaxed">
                取消後會自動把出庫的庫存以 <b>available</b> 狀態建回出庫倉、
                配送狀態同步標為「已取消」。
              </p>
              <div>
                <label className="text-[11px] text-[#9A9890] font-medium block mb-1">
                  取消原因 <span className="text-[#CC0000]">*</span>
                </label>
                <textarea
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  rows={3}
                  placeholder="例如：員工退回、誤出貨⋯"
                  className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none"
                  autoFocus
                />
              </div>
            </div>
            <footer className="px-4 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setVoidModal(null)}
                disabled={pending}
                className="h-[30px] px-3 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmVoid}
                disabled={pending || !voidReason.trim()}
                className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#CC0000] text-white hover:bg-[#A30000] disabled:opacity-50"
              >
                {pending ? "取消中⋯" : "確認取消出庫"}
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
