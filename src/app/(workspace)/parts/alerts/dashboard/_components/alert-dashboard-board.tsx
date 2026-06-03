"use client";

import { useState } from "react";
import Link from "next/link";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { KpiCard } from "@/components/visualization";
import { PdcCountdown } from "@/components/parts/pdc-countdown";

import type {
  AlertDashboardData,
  AlertBalanceRow,
  PendingWoRow,
  OverduePoRow,
} from "@/domain/parts-alerts-dashboard";

// ─────────────────────────────────────────────────────────────
// 導航目標（先用導航避免耦合尚未建好的功能）
// ─────────────────────────────────────────────────────────────
const HREF_NEW_PO = "/parts/purchase/orders/new";
const HREF_REPAIR_PICK = "/parts/issue/repair-pick";

type TabKey = "urgent" | "reorder" | "pendingWos" | "batchExpiry" | "overduePos";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "urgent", label: "緊急（低於最小庫存）" },
  { key: "reorder", label: "預警（低於再訂購點）" },
  { key: "pendingWos", label: "待備料工單" },
  { key: "batchExpiry", label: "批號到期" },
  { key: "overduePos", label: "採購逾期" },
];

// 列尾動作鈕（導航）
const actionBtnClass =
  "h-[26px] px-2.5 rounded text-[11.5px] inline-flex items-center gap-1 bg-[#1A3A5C] text-white hover:bg-[#0F2A45]";
const actionBtnGhostClass =
  "h-[26px] px-2.5 rounded text-[11.5px] inline-flex items-center gap-1 bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]";

function numCell(n: number) {
  return <span className="font-mono tabular-nums">{n.toLocaleString("zh-TW")}</span>;
}

function priorityChip(p: PendingWoRow["priority"]) {
  const map: Record<PendingWoRow["priority"], { label: string; cls: string }> = {
    urgent: { label: "緊急", cls: "bg-[#FDECEA] text-[#CC0000]" },
    high: { label: "高", cls: "bg-[#FDF3E3] text-[#854F0B]" },
    normal: { label: "一般", cls: "bg-[#F2F2F2] text-[#6B6A68]" },
  };
  const c = map[p];
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${c.cls}`}>
      {c.label}
    </span>
  );
}

export function AlertDashboardBoard({ data }: { data: AlertDashboardData }) {
  const [tab, setTab] = useState<TabKey>("urgent");

  // ── 緊急 / 預警 共用欄位（缺口標籤依 tab 略不同）─────────────────
  const balanceColumns = (kind: "urgent" | "reorder"): DataGridColumn<AlertBalanceRow>[] => [
    {
      id: "item_code",
      header: "料號",
      width: 130,
      hideable: false,
      cell: (r) => <span className="font-mono font-semibold text-[#1A3A5C]">{r.item_code}</span>,
      exportValue: (r) => r.item_code,
      sortValue: (r) => r.item_code,
    },
    {
      id: "item_name",
      header: "品名",
      cell: (r) => r.item_name,
      exportValue: (r) => r.item_name,
      sortValue: (r) => r.item_name,
    },
    {
      id: "warehouse_name",
      header: "倉別",
      width: 120,
      cell: (r) => r.warehouse_name ?? "—",
      exportValue: (r) => r.warehouse_name ?? "",
      sortValue: (r) => r.warehouse_name ?? "",
    },
    {
      id: "qty_available",
      header: "可用量",
      width: 90,
      align: "right",
      cell: (r) => numCell(r.qty_available),
      exportValue: (r) => r.qty_available,
      sortValue: (r) => r.qty_available,
    },
    {
      id: "threshold",
      header: kind === "urgent" ? "最小庫存" : "再訂購點",
      width: 100,
      align: "right",
      cell: (r) => numCell((kind === "urgent" ? r.safety_stock : r.reorder_point) ?? 0),
      exportValue: (r) => (kind === "urgent" ? r.safety_stock : r.reorder_point) ?? 0,
      sortValue: (r) => (kind === "urgent" ? r.safety_stock : r.reorder_point) ?? 0,
    },
    {
      id: "shortage",
      header: "缺口",
      width: 90,
      align: "right",
      cell: (r) => <span className="font-mono tabular-nums text-[#CC0000] font-semibold">{r.shortage.toLocaleString("zh-TW")}</span>,
      exportValue: (r) => r.shortage,
      sortValue: (r) => r.shortage,
    },
  ];

  const urgentColumns = balanceColumns("urgent");
  const reorderColumns = balanceColumns("reorder");

  const pendingWoColumns: DataGridColumn<PendingWoRow>[] = [
    {
      id: "ro_no",
      header: "工單號",
      width: 140,
      hideable: false,
      cell: (r) => <span className="font-mono font-semibold text-[#1A3A5C]">{r.ro_no}</span>,
      exportValue: (r) => r.ro_no,
      sortValue: (r) => r.ro_no,
    },
    {
      id: "missing_parts",
      header: "需求零件",
      cell: (r) => r.missing_parts,
      exportValue: (r) => r.missing_parts,
      sortValue: (r) => r.missing_parts,
    },
    {
      id: "sa_name",
      header: "負責 SA",
      width: 110,
      cell: (r) => r.sa_name ?? "—",
      exportValue: (r) => r.sa_name ?? "",
      sortValue: (r) => r.sa_name ?? "",
    },
    {
      id: "days_pending",
      header: "待料天數",
      width: 90,
      align: "right",
      cell: (r) => numCell(r.days_pending),
      exportValue: (r) => r.days_pending,
      sortValue: (r) => r.days_pending,
    },
    {
      id: "priority",
      header: "優先級",
      width: 90,
      sortable: false,
      cell: (r) => priorityChip(r.priority),
      exportValue: (r) => r.priority,
    },
  ];

  const overduePoColumns: DataGridColumn<OverduePoRow>[] = [
    {
      id: "po_no",
      header: "採購單號",
      width: 150,
      hideable: false,
      cell: (r) => (
        <Link
          href={`/parts/purchase/orders/${r.id}`}
          className="font-mono font-semibold text-[#185FA5] hover:underline"
        >
          {r.po_no}
        </Link>
      ),
      exportValue: (r) => r.po_no,
      sortValue: (r) => r.po_no,
    },
    {
      id: "vendor_name",
      header: "供應商",
      cell: (r) => r.vendor_name ?? "—",
      exportValue: (r) => r.vendor_name ?? "",
      sortValue: (r) => r.vendor_name ?? "",
    },
    {
      id: "eta_date",
      header: "預計到貨",
      width: 120,
      cell: (r) => r.eta_date ?? "—",
      exportValue: (r) => r.eta_date ?? "",
      sortValue: (r) => r.eta_date ?? "",
    },
    {
      id: "overdue_days",
      header: "逾期天數",
      width: 100,
      align: "right",
      cell: (r) => (
        <span className="font-mono tabular-nums text-[#CC0000] font-semibold">{r.overdue_days}</span>
      ),
      exportValue: (r) => r.overdue_days,
      sortValue: (r) => r.overdue_days,
    },
  ];

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">庫存告警儀表板</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          庫存 10B
        </span>
        <span className="text-[12px] text-[#9A9890]">
          一眼掌握缺料 / 待備料 / 採購逾期，當天就能決定要補什麼料
        </span>
        <div className="ml-auto">
          <PdcCountdown />
        </div>
      </header>

      {/* 4 KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="🔴 低於最小庫存"
          value={data.kpis.belowMin}
          tone="red"
          layout="vertical"
          icon={<span className="material-symbols-outlined text-[18px]">error</span>}
        />
        <KpiCard
          label="🟡 低於再訂購點"
          value={data.kpis.belowReorder}
          tone="amber"
          layout="vertical"
          icon={<span className="material-symbols-outlined text-[18px]">warning</span>}
        />
        <KpiCard
          label="⏳ 工單待備料"
          value={data.kpis.pendingParts}
          tone="blue"
          layout="vertical"
          icon={<span className="material-symbols-outlined text-[18px]">pending_actions</span>}
        />
        <KpiCard
          label="📅 批號 30 天到期"
          value={data.kpis.batchExpiry}
          tone="purple"
          layout="vertical"
          icon={<span className="material-symbols-outlined text-[18px]">event_busy</span>}
        />
      </div>

      {/* Tabs */}
      <div className="bg-white border border-[#EEECE6] rounded-t-lg overflow-x-auto">
        <div className="flex border-b border-[#EEECE6]">
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 h-[40px] text-[12.5px] whitespace-nowrap border-r last:border-r-0 border-[#EEECE6] ${
                  active
                    ? "bg-white text-[#1A3A5C] font-semibold border-b-2 border-b-[#1A3A5C] -mb-px"
                    : "text-[#5A5955] hover:bg-[#F8F7F4]"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-white border border-[#EEECE6] border-t-0 rounded-b-lg p-4 space-y-3 -mt-3">
        {tab === "urgent" && (
          <DataGrid
            columns={urgentColumns}
            data={data.urgent}
            rowKey={(r) => `${r.item_id}::${r.warehouse_name ?? ""}`}
            persistKey="parts/alerts/dashboard/urgent"
            exportFileName="alert-urgent"
            emptyMessage="目前沒有低於最小庫存的品項"
            rowActionsWidth={220}
            rowActions={(r) => (
              <>
                <button
                  onClick={() => window.open(HREF_NEW_PO, "_blank")}
                  className={actionBtnClass}
                  title={`為 ${r.item_code} 建立採購單`}
                >
                  <span className="material-symbols-outlined text-[14px]">add_shopping_cart</span>
                  緊急補貨
                </button>
                <button
                  onClick={() => alert("跨店查詢功能將於後續版本上線")}
                  className={actionBtnGhostClass}
                  title="查詢其他門市庫存"
                >
                  跨店查詢
                </button>
              </>
            )}
          />
        )}

        {tab === "reorder" && (
          <DataGrid
            columns={reorderColumns}
            data={data.reorder}
            rowKey={(r) => `${r.item_id}::${r.warehouse_name ?? ""}`}
            persistKey="parts/alerts/dashboard/reorder"
            exportFileName="alert-reorder"
            emptyMessage="目前沒有低於再訂購點的品項"
            rowActionsWidth={150}
            rowActions={() => (
              <button
                onClick={() => window.open(HREF_NEW_PO, "_blank")}
                className={actionBtnClass}
              >
                <span className="material-symbols-outlined text-[14px]">add_shopping_cart</span>
                建立採購單
              </button>
            )}
          />
        )}

        {tab === "pendingWos" && (
          <DataGrid
            columns={pendingWoColumns}
            data={data.pendingWos}
            rowKey={(r) => r.id}
            persistKey="parts/alerts/dashboard/pendingWos"
            exportFileName="alert-pending-wos"
            emptyMessage="目前沒有待備料的工單"
            rowActionsWidth={130}
            rowActions={() => (
              <Link href={HREF_REPAIR_PICK} className={actionBtnClass}>
                <span className="material-symbols-outlined text-[14px]">build</span>
                前往備料
              </Link>
            )}
          />
        )}

        {tab === "batchExpiry" && (
          <div className="py-10 flex flex-col items-center justify-center text-center gap-2">
            <span className="material-symbols-outlined text-[32px] text-[#9A9890]">construction</span>
            <p className="text-[13px] text-[#5A5955] font-medium">Phase 2：待 batch expiry 欄位</p>
            <p className="text-[12px] text-[#9A9890] max-w-[420px]">
              批號層目前尚無到期日（expiry）欄位，無法計算 30 天內到期清單。
              待 batch schema 補上 expiry 欄位後，此頁將自動填入到期批號。
            </p>
          </div>
        )}

        {tab === "overduePos" && (
          <DataGrid
            columns={overduePoColumns}
            data={data.overduePos}
            rowKey={(r) => r.id}
            persistKey="parts/alerts/dashboard/overduePos"
            exportFileName="alert-overdue-pos"
            emptyMessage="目前沒有逾期的採購單"
            rowActionsWidth={120}
            rowActions={(r) => (
              <Link href={`/parts/purchase/orders/${r.id}`} className={actionBtnGhostClass}>
                查看採購單
              </Link>
            )}
          />
        )}
      </div>
    </main>
  );
}
