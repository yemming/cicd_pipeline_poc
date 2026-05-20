"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { KpiCard } from "@/components/visualization/KpiCard";
import { FunnelChart } from "@/components/charts/FunnelChart";
import {
  deleteSalesOrderAction,
  setSalesOrderStatusAction,
} from "@/lib/sales/order-actions";
import {
  CONTRACT_TYPE_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_CHIP,
  PAYMENT_METHOD_LABELS,
  type OrderStatus,
  type ContractType,
  type PaymentMethod,
  type SalesOrderKpis,
  type SalesOrderStatusBreakdown,
} from "@/domain/sales-orders.constants";
import type { SalesOrderRow } from "@/domain/sales-orders.constants";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type Banner = { ok: boolean; msg: string } | null;

export type OrdersBoardProps = {
  rows: SalesOrderRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  kpis: SalesOrderKpis;
  statusBreakdown: SalesOrderStatusBreakdown[];
  filterStatus: string;
  filterContractType: string;
  filterQ: string;
  canEdit: boolean;
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function fmtNT(n: number | null): string {
  if (n == null) return "—";
  return `NT$ ${Number(n).toLocaleString("en-US")}`;
}

function fmtDate(s: string | null): string {
  if (!s) return "—";
  return s.slice(0, 10);
}

function StatusChip({ status }: { status: string }) {
  const chip = ORDER_STATUS_CHIP[status as OrderStatus] ?? {
    bg: "bg-[#F2F2F2]",
    text: "text-[#6B6A68]",
  };
  const label =
    ORDER_STATUS_LABELS[status as OrderStatus] ?? status;
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${chip.bg} ${chip.text}`}
    >
      {label}
    </span>
  );
}

function ContractChip({ contractType }: { contractType: string }) {
  const isNew = contractType === "new";
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${
        isNew
          ? "bg-[#EAF4FB] text-[#185FA5]"
          : "bg-[#FDF3E3] text-[#854F0B]"
      }`}
    >
      {CONTRACT_TYPE_LABELS[contractType as ContractType] ?? contractType}
    </span>
  );
}

const inputCls =
  "h-[30px] px-2 rounded border border-[#D5D3CB] text-[12.5px] focus:border-[#185FA5] outline-none bg-white";

// ─────────────────────────────────────────────────────────────
// Board
// ─────────────────────────────────────────────────────────────

export default function OrdersBoard({
  rows,
  totalCount,
  page,
  pageSize,
  kpis,
  statusBreakdown,
  filterStatus,
  filterContractType,
  filterQ,
  canEdit,
}: OrdersBoardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  // Local filter state (push to URL on query)
  const [localStatus, setLocalStatus] = useState(filterStatus);
  const [localContractType, setLocalContractType] = useState(filterContractType);
  const [localQ, setLocalQ] = useState(filterQ);

  function showBanner(ok: boolean, msg: string) {
    setBanner({ ok, msg });
    if (ok) setTimeout(() => setBanner(null), 2200);
  }

  function buildUrl(
    overrides: Partial<{
      status: string;
      contract_type: string;
      q: string;
      page: number;
    }>,
  ) {
    const params = new URLSearchParams();
    const s = overrides.status ?? localStatus;
    const ct = overrides.contract_type ?? localContractType;
    const q = overrides.q ?? localQ;
    const p = overrides.page ?? 1;
    if (s) params.set("status", s);
    if (ct) params.set("contract_type", ct);
    if (q) params.set("q", q);
    if (p > 1) params.set("page", String(p));
    return `/sales/orders?${params.toString()}`;
  }

  function handleQuery() {
    router.push(buildUrl({ page: 1 }));
  }

  function handleReset() {
    setLocalStatus("");
    setLocalContractType("");
    setLocalQ("");
    router.push("/sales/orders");
  }

  function goToPage(p: number) {
    router.push(buildUrl({ page: p }));
  }

  // ── Row actions ──────────────────────────────────────────────

  function handleEdit(row: SalesOrderRow) {
    router.push(`/sales/orders/${row.id}`);
  }

  function handleDelete(row: SalesOrderRow) {
    if (!confirm(`確定要刪除訂單 ${row.order_no}？`)) return;
    startTransition(async () => {
      const res = await deleteSalesOrderAction(row.id);
      if (res.ok) {
        showBanner(true, `✓ 已刪除 ${row.order_no}`);
        router.refresh();
      } else {
        showBanner(false, `✗ 刪除失敗：${res.error}`);
      }
    });
  }

  function handleSetStatus(
    row: SalesOrderRow,
    status: "signed" | "cancelled" | "fulfilled",
  ) {
    const labelMap: Record<string, string> = {
      signed: "簽約",
      cancelled: "作廢",
      fulfilled: "交車完成",
    };
    if (!confirm(`確定將 ${row.order_no} 設為「${labelMap[status]}」？`)) return;
    startTransition(async () => {
      const res = await setSalesOrderStatusAction(row.id, status);
      if (res.ok) {
        showBanner(true, `✓ 已更新狀態`);
        router.refresh();
      } else {
        showBanner(false, `✗ ${res.error}`);
      }
    });
  }

  // ── Columns ──────────────────────────────────────────────────

  const columns: DataGridColumn<SalesOrderRow>[] = [
    {
      id: "order_no",
      header: "合約編號",
      width: 160,
      hideable: false,
      cell: (r) => (
        <Link
          href={`/sales/orders/${r.id}`}
          className="font-mono font-semibold text-[#1A3A5C] hover:underline"
        >
          {r.order_no}
        </Link>
      ),
      exportValue: (r) => r.order_no,
      sortValue: (r) => r.order_no,
    },
    {
      id: "contract_type",
      header: "合約類型",
      width: 140,
      cell: (r) => <ContractChip contractType={r.contract_type} />,
      exportValue: (r) =>
        CONTRACT_TYPE_LABELS[r.contract_type as ContractType] ?? r.contract_type,
      sortValue: (r) => r.contract_type,
    },
    {
      id: "status",
      header: "狀態",
      width: 90,
      cell: (r) => <StatusChip status={r.status} />,
      exportValue: (r) =>
        ORDER_STATUS_LABELS[r.status as OrderStatus] ?? r.status,
      sortValue: (r) => r.status,
    },
    {
      id: "customer_name",
      header: "客戶",
      width: 130,
      cell: (r) => (
        <span className="text-[12px] text-[#2C2C2A]">
          {r.customer_name ?? "—"}
        </span>
      ),
      exportValue: (r) => r.customer_name ?? "",
      sortValue: (r) => r.customer_name ?? "",
    },
    {
      id: "vehicle",
      header: "車款",
      width: 160,
      cell: (r) => (
        <span className="text-[12px] text-[#2C2C2A]">
          {r.contract_type === "new"
            ? (r.vehicle_model_name ?? "—")
            : (r.used_brand_model ?? "—")}
        </span>
      ),
      exportValue: (r) =>
        r.contract_type === "new"
          ? (r.vehicle_model_name ?? "")
          : (r.used_brand_model ?? ""),
    },
    {
      id: "payment_method",
      header: "付款",
      width: 100,
      cell: (r) => (
        <span className="text-[12px] text-[#5A5955]">
          {r.payment_method
            ? (PAYMENT_METHOD_LABELS[r.payment_method as PaymentMethod] ??
              r.payment_method)
            : "—"}
        </span>
      ),
      exportValue: (r) =>
        r.payment_method
          ? (PAYMENT_METHOD_LABELS[r.payment_method as PaymentMethod] ??
            r.payment_method)
          : "",
    },
    {
      id: "total_amount",
      header: "成交金額",
      width: 120,
      align: "right",
      cell: (r) => (
        <span className="font-mono text-[12px] text-[#2C2C2A]">
          {fmtNT(
            r.contract_type === "new" ? r.total_amount : r.deal_price,
          )}
        </span>
      ),
      exportValue: (r) =>
        String(r.contract_type === "new" ? r.total_amount ?? "" : r.deal_price ?? ""),
      sortValue: (r) =>
        r.contract_type === "new"
          ? (r.total_amount ?? 0)
          : (r.deal_price ?? 0),
    },
    {
      id: "rs_name",
      header: "銷售顧問",
      width: 100,
      defaultHidden: true,
      cell: (r) => (
        <span className="text-[12px] text-[#5A5955]">{r.rs_name ?? "—"}</span>
      ),
      exportValue: (r) => r.rs_name ?? "",
      sortValue: (r) => r.rs_name ?? "",
    },
    {
      id: "delivery_date",
      header: "預計交車",
      width: 100,
      cell: (r) => (
        <span className="font-mono text-[11.5px] text-[#5A5955]">
          {fmtDate(r.delivery_date)}
        </span>
      ),
      exportValue: (r) => fmtDate(r.delivery_date),
      sortValue: (r) => r.delivery_date ?? "",
    },
    {
      id: "created_at",
      header: "建立日期",
      width: 100,
      cell: (r) => (
        <span className="font-mono text-[11.5px] text-[#9A9890]">
          {fmtDate(r.created_at)}
        </span>
      ),
      exportValue: (r) => fmtDate(r.created_at),
      sortValue: (r) => r.created_at,
    },
  ];

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────

  return (
    <div className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">訂單中心</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          銷售 · RS04
        </span>
        <span className="text-[12px] text-[#9A9890]">
          新車訂購合約 + 中古車買賣合約管理
        </span>
      </header>

      {/* KPI Row — A 級升級（2026-05-20，M01-8） */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
        <KpiCard
          tone="blue"
          label="本月訂單"
          value={kpis.monthly_count}
          layout="vertical"
        />
        <KpiCard
          tone="teal"
          label="本月成交金額"
          value={
            kpis.monthly_amount > 0
              ? `NT$ ${kpis.monthly_amount.toLocaleString("en-US")}`
              : "—"
          }
          layout="vertical"
        />
        <KpiCard
          tone="amber"
          label="待簽核"
          value={kpis.pending_approval_count}
          layout="vertical"
        />
        <KpiCard
          tone="purple"
          label="待交車"
          value={kpis.pending_delivery_count}
          layout="vertical"
        />
        <KpiCard
          tone="green"
          label="本月已交車"
          value={kpis.fulfilled_this_month}
          layout="vertical"
        />
      </section>

      {/* Funnel + Status Breakdown */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white border border-[#EEECE6] rounded-lg p-3 md:col-span-2">
          <div className="text-[13px] font-semibold text-[#2C2C2A] mb-1.5">
            訂單漏斗
          </div>
          <div className="text-[11px] text-[#9A9890] mb-2">
            草稿 → 送簽 → 已簽約 → 已交車（轉換階段視覺化）
          </div>
          <FunnelChart
            data={(() => {
              const map = new Map(
                statusBreakdown.map((s) => [s.status, s.count]),
              );
              const draft = map.get("draft") ?? 0;
              const submitted = map.get("submitted") ?? 0;
              const signed = map.get("signed") ?? 0;
              const fulfilled = map.get("fulfilled") ?? 0;
              return [
                {
                  name: `草稿 (${draft + submitted + signed + fulfilled})`,
                  value: Math.max(draft + submitted + signed + fulfilled, 1),
                },
                {
                  name: `送簽以上 (${submitted + signed + fulfilled})`,
                  value: Math.max(submitted + signed + fulfilled, 0.01),
                },
                {
                  name: `已簽約以上 (${signed + fulfilled})`,
                  value: Math.max(signed + fulfilled, 0.01),
                },
                {
                  name: `已交車 (${fulfilled})`,
                  value: Math.max(fulfilled, 0.01),
                },
              ];
            })()}
            tone="blue"
            size="md"
          />
        </div>
        <div className="bg-white border border-[#EEECE6] rounded-lg p-3">
          <div className="text-[13px] font-semibold text-[#2C2C2A] mb-2">
            狀態分佈
          </div>
          <div className="space-y-1.5">
            {statusBreakdown.map((s) => (
              <div
                key={s.status}
                className="flex items-center justify-between text-[12px]"
              >
                <StatusChip status={s.status} />
                <span className="font-mono font-semibold text-[#2C2C2A]">
                  {s.count}
                </span>
              </div>
            ))}
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
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">
              狀態
            </label>
            <select
              className={inputCls}
              value={localStatus}
              onChange={(e) => setLocalStatus(e.target.value)}
            >
              <option value="">全部</option>
              <option value="draft">草稿</option>
              <option value="signed">已簽約</option>
              <option value="fulfilled">已交車</option>
              <option value="cancelled">已作廢</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">
              合約類型
            </label>
            <select
              className={inputCls}
              value={localContractType}
              onChange={(e) => setLocalContractType(e.target.value)}
            >
              <option value="">全部</option>
              <option value="new">新車</option>
              <option value="used">中古車</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">
              搜尋
            </label>
            <input
              type="text"
              className={`${inputCls} w-[200px]`}
              placeholder="合約編號 / 客戶姓名"
              value={localQ}
              onChange={(e) => setLocalQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleQuery()}
            />
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={handleQuery}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "查詢中⋯" : "查詢"}
            </button>
            <button
              onClick={handleReset}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
            >
              重置
            </button>
            {canEdit && (
              <Link
                href="/sales/orders/new"
                className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] inline-flex items-center"
              >
                ＋ 新增合約
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{totalCount}</b> 筆合約
        </span>
      </div>

      {/* Table */}
      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="sales/orders"
        exportFileName="sales-orders"
        emptyMessage="沒有符合條件的合約"
        disabled={isPending}
        rowActionsWidth={240}
        pagination={{
          page,
          pageSize,
          totalCount,
          onPageChange: goToPage,
        }}
        rowActions={(r) => (
          <>
            <button
              onClick={() => handleEdit(r)}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              查看
            </button>
            {canEdit && r.status === "draft" && (
              <button
                onClick={() => handleSetStatus(r, "signed")}
                disabled={isPending}
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#EAF4FB] border border-[#85B7EB] text-[#185FA5] hover:bg-[#d4eaf8] disabled:opacity-50"
              >
                簽約
              </button>
            )}
            {canEdit && r.status === "signed" && (
              <button
                onClick={() => handleSetStatus(r, "fulfilled")}
                disabled={isPending}
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#EAF3DE] border border-[#C5DC9F] text-[#3B6D11] hover:bg-[#d9f0c8] disabled:opacity-50"
              >
                交車完成
              </button>
            )}
            {canEdit &&
              (r.status === "draft" || r.status === "signed") && (
                <button
                  onClick={() => handleSetStatus(r, "cancelled")}
                  disabled={isPending}
                  className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
                >
                  作廢
                </button>
              )}
            {canEdit && r.status === "draft" && (
              <button
                onClick={() => handleDelete(r)}
                disabled={isPending}
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
              >
                刪除
              </button>
            )}
          </>
        )}
      />
    </div>
  );
}
