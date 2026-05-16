"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  setAftersalesCustomerActiveAction,
  deleteAftersalesCustomerAction,
} from "@/lib/aftersales/customer-base-actions";
import {
  SERVICE_STATUS_LABEL,
  type AftersalesCustomerBaseFilters,
  type AftersalesServiceStatus,
} from "@/domain/aftersales-customer-base.constants";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";

export type AftersalesCustomerBaseRow = {
  id: string;
  code: string;
  name: string;
  type: "individual" | "corporate";
  phone: string | null;
  email: string | null;
  is_active: boolean;
  primary_license_plate: string | null;
  primary_mileage: number | null;
  vehicle_count: number;
  visit_count: number;
  last_visit_at: string | null;
  last_ro_no: string | null;
  next_due_date: string | null;
  service_status: AftersalesServiceStatus;
};

type Banner = { ok: boolean; msg: string } | null;

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toISOString().slice(0, 10);
  } catch {
    return "—";
  }
}

function ServiceStatusChip({ status }: { status: AftersalesServiceStatus }) {
  const cls: Record<AftersalesServiceStatus, string> = {
    active_service: "bg-[#EAF3DE] text-[#3B6D11]",
    at_risk: "bg-[#FDF3E3] text-[#854F0B]",
    dormant: "bg-[#FDECEA] text-[#CC0000]",
    unknown: "bg-[#F2F2F2] text-[#6B6A68]",
  };
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${cls[status]}`}
    >
      {SERVICE_STATUS_LABEL[status]}
    </span>
  );
}

export function AftersalesCustomerBaseBoard({
  rows,
  totalCount,
  canEdit,
  filters,
}: {
  rows: AftersalesCustomerBaseRow[];
  totalCount: number;
  canEdit: boolean;
  filters: AftersalesCustomerBaseFilters;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const [fServiceStatus, setFServiceStatus] = useState(filters.service_status);
  const [fType, setFType] = useState(filters.type);
  const [fQ, setFQ] = useState(filters.q);

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const submitFilters = () => {
    const params = new URLSearchParams();
    if (fServiceStatus !== "all") params.set("service_status", fServiceStatus);
    if (fType !== "all") params.set("type", fType);
    if (fQ.trim()) params.set("q", fQ.trim());
    const qs = params.toString();
    startTransition(() => {
      router.push(
        qs ? `/crm/aftersales/customer-base?${qs}` : "/crm/aftersales/customer-base",
      );
    });
  };
  const resetFilters = () => {
    setFServiceStatus("all");
    setFType("all");
    setFQ("");
    startTransition(() => router.push("/crm/aftersales/customer-base"));
  };

  const toggleActive = (r: AftersalesCustomerBaseRow) => {
    startTransition(async () => {
      const res = await setAftersalesCustomerActiveAction(r.id, !r.is_active);
      if (res.ok) {
        showBanner({ ok: true, msg: r.is_active ? "✓ 已停用" : "✓ 已啟用" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const removeRow = (r: AftersalesCustomerBaseRow) => {
    if (
      !confirm(
        `確定刪除「${r.code} ${r.name}」？\n此動作不可復原；若有歷史工單／預約／車輛將會失敗，建議改用「停用」保留歷史。`,
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteAftersalesCustomerAction(r.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除客戶" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5]";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";

  const columns: DataGridColumn<AftersalesCustomerBaseRow>[] = [
    {
      id: "code",
      header: "客戶代碼",
      width: 110,
      hideable: false,
      cell: (r) => (
        <Link
          href={`/crm/aftersales/customer-base/${r.id}`}
          className="font-mono text-[12px] text-[#185FA5] hover:underline"
        >
          {r.code}
        </Link>
      ),
      exportValue: (r) => r.code,
      sortValue: (r) => r.code,
    },
    {
      id: "name",
      header: "客戶名稱",
      cell: (r) => (
        <div>
          <Link
            href={`/crm/aftersales/customer-base/${r.id}`}
            className="font-semibold text-[12.5px] text-[#185FA5] hover:underline"
          >
            {r.name}
          </Link>
          <div className="text-[11px] text-[#9A9890]">
            {r.type === "corporate" ? "公司戶" : "個人戶"}
            {r.phone ? ` ・ ${r.phone}` : ""}
          </div>
        </div>
      ),
      exportValue: (r) => r.name,
      sortValue: (r) => r.name,
    },
    {
      id: "primary_vehicle",
      header: "主車輛",
      width: 140,
      cell: (r) =>
        r.primary_license_plate ? (
          <div>
            <div className="font-mono font-semibold text-[12.5px] text-[#1A3A5C]">
              {r.primary_license_plate}
            </div>
            {r.vehicle_count > 1 ? (
              <div className="text-[11px] text-[#9A9890]">
                共 {r.vehicle_count} 台
              </div>
            ) : null}
          </div>
        ) : (
          <span className="text-[#9A9890] text-[12px]">—</span>
        ),
      exportValue: (r) => r.primary_license_plate ?? "",
      sortValue: (r) => r.primary_license_plate ?? "",
    },
    {
      id: "primary_mileage",
      header: "目前里程",
      width: 100,
      align: "right",
      cell: (r) =>
        r.primary_mileage != null ? (
          <span className="font-mono text-[12px]">
            {Number(r.primary_mileage).toLocaleString("en-US")} km
          </span>
        ) : (
          <span className="text-[#9A9890] text-[12px]">—</span>
        ),
      exportValue: (r) => r.primary_mileage ?? "",
      sortValue: (r) => r.primary_mileage ?? -1,
      defaultHidden: false,
    },
    {
      id: "visit_count",
      header: "入廠次數",
      width: 90,
      align: "right",
      cell: (r) => (
        <span className="font-mono text-[12px] text-[#2C2C2A]">
          {r.visit_count}
        </span>
      ),
      exportValue: (r) => r.visit_count,
      sortValue: (r) => r.visit_count,
    },
    {
      id: "last_visit",
      header: "上次入廠",
      width: 130,
      cell: (r) =>
        r.last_visit_at ? (
          <div>
            <div className="font-mono text-[11.5px]">
              {fmtDate(r.last_visit_at)}
            </div>
            {r.last_ro_no ? (
              <div className="font-mono text-[10.5px] text-[#9A9890]">
                {r.last_ro_no}
              </div>
            ) : null}
          </div>
        ) : (
          <span className="text-[#9A9890] text-[12px]">未進廠</span>
        ),
      exportValue: (r) => r.last_visit_at ?? "",
      sortValue: (r) => r.last_visit_at ?? "",
    },
    {
      id: "next_due",
      header: "下次預定保養",
      width: 120,
      cell: (r) =>
        r.next_due_date ? (
          <span className="font-mono text-[11.5px]">
            {fmtDate(r.next_due_date)}
          </span>
        ) : (
          <span className="text-[#9A9890] text-[12px]">—</span>
        ),
      exportValue: (r) => r.next_due_date ?? "",
      sortValue: (r) => r.next_due_date ?? "",
    },
    {
      id: "service_status",
      header: "服務狀態",
      width: 110,
      cell: (r) => <ServiceStatusChip status={r.service_status} />,
      exportValue: (r) => SERVICE_STATUS_LABEL[r.service_status],
      sortValue: (r) => r.service_status,
    },
    {
      id: "email",
      header: "Email",
      defaultHidden: true,
      cell: (r) =>
        r.email ? (
          <span className="text-[11.5px]">{r.email}</span>
        ) : (
          <span className="text-[#9A9890] text-[12px]">—</span>
        ),
      exportValue: (r) => r.email ?? "",
      sortValue: (r) => r.email ?? "",
    },
    {
      id: "is_active",
      header: "往來",
      width: 70,
      cell: (r) => (
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${
            r.is_active
              ? "bg-[#EAF3DE] text-[#3B6D11]"
              : "bg-[#F2F2F2] text-[#6B6A68]"
          }`}
        >
          {r.is_active ? "往來中" : "停用"}
        </span>
      ),
      exportValue: (r) => (r.is_active ? "往來中" : "停用"),
      sortValue: (r) => r.is_active,
    },
  ];

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">
          售後客戶基盤
        </h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          售後 CRM
        </span>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#F0EFFE] text-[#534AB7] font-semibold">
          ★5
        </span>
        <span className="text-[12px] text-[#9A9890]">
          服務廠視角・累積入廠・上次保養・回廠提醒
        </span>
      </header>

      {/* ★5 跨模組 banner — 反向連回售後接待 人車檔案（同一批 customers SSOT） */}
      <section className="bg-[#F0EFFE] border border-[#C4BEF0] rounded-lg px-4 py-2.5 flex items-center gap-3 flex-wrap">
        <span className="text-[11px] text-[#534AB7] font-semibold">
          ★5 跨模組
        </span>
        <span className="text-[12px] text-[#26215C]">
          本頁是 <strong>CRM 視角</strong>（NPS / 預約 / 行銷標籤）；同一批客戶在
          <strong>售後接待視角</strong>強調進廠 / 保固 / 主車輛維修履歷。
        </span>
        <Link
          href="/parts/aftersales/customers"
          className="ml-auto h-[26px] px-3 rounded-full text-[11.5px] inline-flex items-center bg-[#534AB7] text-white hover:bg-[#3F3793] font-medium"
        >
          切換到售後接待視角 →
        </Link>
      </section>

      {banner ? (
        <div
          className={`px-3 py-2 rounded text-[13px] ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11]"
              : "bg-[#FDECEA] text-[#CC0000]"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}

      {/* Filter Bar */}
      <section
        className={`bg-white border border-[#EEECE6] rounded-lg px-4 py-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}
      >
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>服務狀態</label>
            <select
              value={fServiceStatus}
              onChange={(e) => setFServiceStatus(e.target.value)}
              className={`${inputClass} w-[120px]`}
            >
              <option value="all">全部</option>
              <option value="active_service">服務中</option>
              <option value="at_risk">待回廠</option>
              <option value="dormant">流失邊緣</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>類型</label>
            <select
              value={fType}
              onChange={(e) => setFType(e.target.value)}
              className={`${inputClass} w-[100px]`}
            >
              <option value="all">全部</option>
              <option value="individual">個人</option>
              <option value="corporate">公司</option>
            </select>
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[240px]">
            <label className={labelClass}>
              代碼 / 名稱 / 電話 / 統編 / 車牌
            </label>
            <input
              type="text"
              value={fQ}
              onChange={(e) => setFQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitFilters()}
              placeholder="輸入關鍵字..."
              className={`${inputClass} w-full`}
            />
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={submitFilters}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "查詢中…" : "查詢"}
            </button>
            <button
              type="button"
              onClick={resetFilters}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
            <Link
              href="/crm/aftersales/customer-base/new"
              aria-disabled={!canEdit}
              data-testid="aftersales-customer-base-create-link"
              className={`h-[30px] inline-flex items-center px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] ${canEdit ? "" : "opacity-50 pointer-events-none"}`}
            >
              ＋ 新增客戶
            </Link>
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{totalCount.toLocaleString("en-US")}</b>{" "}
          筆客戶（顯示{" "}
          <b className="text-[#2C2C2A]">{rows.length.toLocaleString("en-US")}</b>{" "}
          筆）
        </span>
      </div>

      {/* Table */}
      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="aftersales/crm/customer-base"
        exportFileName={`aftersales-customer-base-${new Date().toISOString().slice(0, 10)}`}
        disabled={isPending}
        emptyMessage={
          filters.q || filters.type !== "all" || filters.service_status !== "all"
            ? "無符合條件的客戶，請調整篩選條件"
            : "尚無客戶資料"
        }
        rowActionsWidth={210}
        rowActions={(r) => (
          <>
            <Link
              href={`/crm/aftersales/customer-base/${r.id}`}
              className="h-[26px] inline-flex items-center px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              編輯
            </Link>
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => toggleActive(r)}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              {r.is_active ? "停用" : "啟用"}
            </button>
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => removeRow(r)}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
            >
              刪除
            </button>
          </>
        )}
      />
    </main>
  );
}
