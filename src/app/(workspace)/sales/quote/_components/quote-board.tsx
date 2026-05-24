"use client";

/**
 * Quote Board — A 級版（2026-05-20）
 *
 * 賞車報價單管理 — 完整 DB-driven。
 * 視覺：KpiCard 頂列 / FunnelChart 報價漏斗 / DataGrid 列表。
 *
 * spec: RS04 賞車報價與成交訂單 v1（list 形式）
 */

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";

import { useSetPageHeader } from "@/components/page-header-context";
import { KpiCard } from "@/components/visualization/KpiCard";
import { FunnelChart } from "@/components/charts/FunnelChart";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import {
  deleteSalesQuoteAction,
  setSalesQuoteStatusAction,
} from "@/lib/sales/quote-actions";
import {
  QUOTE_STATUS_LABELS,
  QUOTE_STATUS_CHIP,
  VEHICLE_KIND_LABELS,
  type SalesQuoteRow,
  type QuoteKpis,
  type QuoteStatus,
  type VehicleKind,
} from "@/domain/sales-quote.constants";

// ─────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────

type Banner = { ok: boolean; msg: string } | null;

export type QuoteBoardProps = {
  rows: SalesQuoteRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  kpis: QuoteKpis;
  statusBreakdown: { status: QuoteStatus; count: number }[];
  filterStatus: string;
  filterVehicleKind: string;
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
  const chip = QUOTE_STATUS_CHIP[status as QuoteStatus] ?? {
    bg: "bg-[#F2F2F2]",
    text: "text-[#6B6A68]",
  };
  const label = QUOTE_STATUS_LABELS[status as QuoteStatus] ?? status;
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${chip.bg} ${chip.text}`}
    >
      {label}
    </span>
  );
}

function VehicleKindChip({ kind }: { kind: string }) {
  const isNew = kind === "new";
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${
        isNew
          ? "bg-[#EAF4FB] text-[#185FA5]"
          : "bg-[#FDF3E3] text-[#854F0B]"
      }`}
    >
      {VEHICLE_KIND_LABELS[kind as VehicleKind] ?? kind}
    </span>
  );
}

const inputCls =
  "h-[30px] px-2 rounded border border-[#D5D3CB] text-[12.5px] focus:border-[#185FA5] outline-none bg-white";

// ─────────────────────────────────────────────────────────────
// Board
// ─────────────────────────────────────────────────────────────

export default function QuoteBoard({
  rows,
  totalCount,
  page,
  pageSize,
  kpis,
  statusBreakdown,
  filterStatus,
  filterVehicleKind,
  filterQ,
  canEdit,
}: QuoteBoardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  // Local filter state
  const [localStatus, setLocalStatus] = useState(filterStatus);
  const [localVehicleKind, setLocalVehicleKind] = useState(filterVehicleKind);
  const [localQ, setLocalQ] = useState(filterQ);

  useSetPageHeader({
    breadcrumb: [
      { label: "銷售管理", href: "/sales/overview" },
      { label: "賞車報價" },
    ],
  });

  function showBanner(ok: boolean, msg: string) {
    setBanner({ ok, msg });
    if (ok) setTimeout(() => setBanner(null), 2200);
  }

  function buildUrl(
    overrides: Partial<{
      status: string;
      vehicle_kind: string;
      q: string;
      page: number;
    }>,
  ) {
    const params = new URLSearchParams();
    const s = overrides.status ?? localStatus;
    const vk = overrides.vehicle_kind ?? localVehicleKind;
    const q = overrides.q ?? localQ;
    const p = overrides.page ?? 1;
    if (s) params.set("status", s);
    if (vk) params.set("vehicle_kind", vk);
    if (q) params.set("q", q);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/sales/quote?${qs}` : "/sales/quote";
  }

  function handleQuery() {
    router.push(buildUrl({ page: 1 }));
  }

  function handleReset() {
    setLocalStatus("");
    setLocalVehicleKind("");
    setLocalQ("");
    router.push("/sales/quote");
  }

  function goToPage(p: number) {
    router.push(buildUrl({ page: p }));
  }

  // ── Row actions ──────────────────────────────────────────────

  function handleSend(row: SalesQuoteRow) {
    if (!confirm(`確定將 ${row.quote_no} 標記為「已傳送」？`)) return;
    startTransition(async () => {
      const res = await setSalesQuoteStatusAction(row.id, "sent");
      if (res.ok) {
        showBanner(true, `✓ ${row.quote_no} 已傳送`);
        router.refresh();
      } else {
        showBanner(false, `✗ ${res.error}`);
      }
    });
  }

  function handleWin(row: SalesQuoteRow) {
    if (!confirm(`確定 ${row.quote_no} 成交？`)) return;
    startTransition(async () => {
      const res = await setSalesQuoteStatusAction(row.id, "won");
      if (res.ok) {
        showBanner(true, `✓ ${row.quote_no} 已成交`);
        router.refresh();
      } else {
        showBanner(false, `✗ ${res.error}`);
      }
    });
  }

  function handleLose(row: SalesQuoteRow) {
    if (!confirm(`確定 ${row.quote_no} 未成交？`)) return;
    startTransition(async () => {
      const res = await setSalesQuoteStatusAction(row.id, "lost");
      if (res.ok) {
        showBanner(true, `✓ ${row.quote_no} 已標記未成交`);
        router.refresh();
      } else {
        showBanner(false, `✗ ${res.error}`);
      }
    });
  }

  function handleDelete(row: SalesQuoteRow) {
    if (!confirm(`確定要刪除報價單 ${row.quote_no}？`)) return;
    startTransition(async () => {
      const res = await deleteSalesQuoteAction(row.id);
      if (res.ok) {
        showBanner(true, `✓ 已刪除 ${row.quote_no}`);
        router.refresh();
      } else {
        showBanner(false, `✗ 刪除失敗：${res.error}`);
      }
    });
  }

  // ── Funnel data ──────────────────────────────────────────────
  // 漏斗順序：草稿 → 已傳送 → 成交（並列：未成交 / 過期 不進主漏斗 chart）
  const funnelData = (() => {
    const map = new Map(statusBreakdown.map((s) => [s.status, s.count]));
    const open = map.get("open") ?? 0;
    const sent = map.get("sent") ?? 0;
    const won = map.get("won") ?? 0;
    // 漏斗 = 全部草稿池（open + sent + won + lost + expired） → 已傳送以上 → 成交
    const total = open + sent + won + (map.get("lost") ?? 0) + (map.get("expired") ?? 0);
    return [
      { name: `全部報價 (${total})`, value: Math.max(total, 1) },
      { name: `已傳送以上 (${sent + won})`, value: Math.max(sent + won, 0.01) },
      { name: `成交 (${won})`, value: Math.max(won, 0.01) },
    ];
  })();

  // ── Columns ──────────────────────────────────────────────────

  const columns: DataGridColumn<SalesQuoteRow>[] = [
    {
      id: "quote_no",
      header: "報價單號",
      width: 160,
      hideable: false,
      cell: (r) => (
        <Link
          href={`/sales/quote/${r.id}`}
          className="font-mono font-semibold text-[#1A3A5C] hover:text-[#185FA5] hover:underline"
        >
          {r.quote_no}
        </Link>
      ),
      exportValue: (r) => r.quote_no,
      sortValue: (r) => r.quote_no,
    },
    {
      id: "vehicle_kind",
      header: "車種",
      width: 80,
      cell: (r) => <VehicleKindChip kind={r.vehicle_kind} />,
      exportValue: (r) =>
        VEHICLE_KIND_LABELS[r.vehicle_kind as VehicleKind] ?? r.vehicle_kind,
      sortValue: (r) => r.vehicle_kind,
    },
    {
      id: "status",
      header: "狀態",
      width: 90,
      cell: (r) => <StatusChip status={r.status} />,
      exportValue: (r) =>
        QUOTE_STATUS_LABELS[r.status as QuoteStatus] ?? r.status,
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
      width: 180,
      cell: (r) => (
        <span className="text-[12px] text-[#2C2C2A]">
          {r.vehicle_kind === "new"
            ? (r.vehicle_model_name ?? "—")
            : (r.used_brand_model ?? r.vehicle_model_name ?? "—")}
        </span>
      ),
      exportValue: (r) =>
        r.vehicle_kind === "new"
          ? (r.vehicle_model_name ?? "")
          : (r.used_brand_model ?? r.vehicle_model_name ?? ""),
      sortValue: (r) => r.vehicle_model_name ?? r.used_brand_model ?? "",
    },
    {
      id: "total_amount",
      header: "報價金額",
      width: 120,
      align: "right",
      cell: (r) => (
        <span className="font-mono text-[12px] text-[#2C2C2A]">
          {fmtNT(r.total_amount)}
        </span>
      ),
      exportValue: (r) => String(r.total_amount ?? ""),
      sortValue: (r) => r.total_amount ?? 0,
    },
    {
      id: "rs_name",
      header: "負責 RS",
      width: 100,
      cell: (r) => (
        <span className="text-[12px] text-[#5A5955]">{r.rs_name ?? "—"}</span>
      ),
      exportValue: (r) => r.rs_name ?? "",
      sortValue: (r) => r.rs_name ?? "",
    },
    {
      id: "expires_at",
      header: "有效期",
      width: 100,
      cell: (r) => (
        <span className="font-mono text-[11.5px] text-[#5A5955]">
          {fmtDate(r.expires_at)}
        </span>
      ),
      exportValue: (r) => fmtDate(r.expires_at),
      sortValue: (r) => r.expires_at ?? "",
    },
    {
      id: "estimated_delivery_date",
      header: "預估交期",
      width: 100,
      defaultHidden: true,
      cell: (r) => (
        <span className="font-mono text-[11.5px] text-[#5A5955]">
          {fmtDate(r.estimated_delivery_date)}
        </span>
      ),
      exportValue: (r) => fmtDate(r.estimated_delivery_date),
      sortValue: (r) => r.estimated_delivery_date ?? "",
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
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">賞車報價</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          銷售 · RS04-quote
        </span>
        <span className="text-[12px] text-[#9A9890]">
          客戶賞車 → 業務開報價單 → 成交 → 建合約
        </span>
      </header>

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

      {/* KPI Row */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
        <KpiCard
          tone="blue"
          label="本月開立報價"
          value={kpis.monthly_count}
          layout="vertical"
        />
        <KpiCard
          tone="teal"
          label="本月報價金額"
          value={fmtNT(kpis.monthly_amount)}
          layout="vertical"
        />
        <KpiCard
          tone="amber"
          label="待簽約"
          value={kpis.pending_count}
          layout="vertical"
        />
        <KpiCard
          tone="red"
          label="30 天內過期"
          value={kpis.expiring_30_days}
          layout="vertical"
        />
        <KpiCard
          tone="green"
          label="本月轉換率"
          value={`${kpis.conversion_rate_pct}%`}
          layout="vertical"
        />
      </section>

      {/* Funnel + Status Breakdown */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white border border-[#EEECE6] rounded-lg p-3 md:col-span-2">
          <div className="text-[13px] font-semibold text-[#2C2C2A] mb-1.5">
            報價漏斗
          </div>
          <div className="text-[11px] text-[#9A9890] mb-2">
            全部報價 → 已傳送 → 成交（轉換率視覺化）
          </div>
          <FunnelChart data={funnelData} tone="blue" size="md" />
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
              <option value="open">草稿</option>
              <option value="sent">已傳送</option>
              <option value="won">成交</option>
              <option value="lost">未成交</option>
              <option value="expired">已過期</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">
              車種
            </label>
            <select
              className={inputCls}
              value={localVehicleKind}
              onChange={(e) => setLocalVehicleKind(e.target.value)}
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
              className={`${inputCls} w-[220px]`}
              placeholder="報價單號 / 客戶 / 車款"
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
                href="/sales/quote/new"
                className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] inline-flex items-center"
              >
                ＋ 新增報價
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{totalCount}</b> 筆報價單
        </span>
      </div>

      {/* Table */}
      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="sales/quote"
        exportFileName="sales-quotes"
        emptyMessage="沒有符合條件的報價單"
        disabled={isPending}
        rowActionsWidth={260}
        pagination={{
          page,
          pageSize,
          totalCount,
          onPageChange: goToPage,
        }}
        rowActions={(r) => (
          <>
            {canEdit && r.status === "open" && (
              <button
                onClick={() => handleSend(r)}
                disabled={isPending}
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#EAF4FB] border border-[#85B7EB] text-[#185FA5] hover:bg-[#d4eaf8] disabled:opacity-50"
              >
                傳送
              </button>
            )}
            {canEdit && (r.status === "open" || r.status === "sent") && (
              <button
                onClick={() => handleWin(r)}
                disabled={isPending}
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#EAF3DE] border border-[#C5DC9F] text-[#3B6D11] hover:bg-[#d9f0c8] disabled:opacity-50"
              >
                成交
              </button>
            )}
            {canEdit && (r.status === "open" || r.status === "sent") && (
              <button
                onClick={() => handleLose(r)}
                disabled={isPending}
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
              >
                未成交
              </button>
            )}
            {canEdit && r.status !== "won" && (
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
