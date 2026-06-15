"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { useSetPageHeader } from "@/components/page-header-context";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { KpiCard } from "@/components/visualization";
import {
  SERVICE_STATUS_LABEL,
  isVipRow,
  type AftersalesCustomerBaseFilters,
  type AftersalesCustomerBaseKpi,
  type AftersalesServiceStatus,
} from "@/domain/aftersales-customer-base.constants";
import type { AftersalesCustomerBaseRow, ModelRef } from "@/domain/aftersales-customer-base";

const labelClass = "text-[11px] text-[#9A9890] font-medium";
const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none bg-white";

function serviceChip(s: AftersalesServiceStatus): string {
  switch (s) {
    case "active_service":
      return "bg-[#EAF3DE] text-[#3B6D11]";
    case "at_risk":
      return "bg-[#FDF3E3] text-[#854F0B]";
    case "dormant":
      return "bg-[#FDECEA] text-[#CC0000]";
    default:
      return "bg-[#F2F2F2] text-[#6B6A68]";
  }
}

function typeChip(t: "individual" | "corporate"): string {
  return t === "corporate"
    ? "bg-[#EAF4FB] text-[#185FA5]"
    : "bg-[#EBF3FF] text-[#1A3A5C]";
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toISOString().slice(0, 10);
  } catch {
    return "—";
  }
}

function fmtMileage(m: number | null): string {
  if (m == null) return "—";
  return `${m.toLocaleString()} km`;
}

export function CustomersBoard({
  rows,
  totalCount,
  filters,
  kpi,
  models,
  canEdit,
}: {
  rows: AftersalesCustomerBaseRow[];
  totalCount: number;
  filters: AftersalesCustomerBaseFilters;
  kpi: AftersalesCustomerBaseKpi;
  /** 車型清單（車型篩選下拉用） */
  models: ModelRef[];
  /** 是否有新增客戶權限 */
  canEdit: boolean;
}) {
  useSetPageHeader({
    title: "人車檔案",
    breadcrumb: [
      { label: "售後修護", href: "/parts/aftersales" },
      { label: "人車檔案" },
    ],
    hideSearch: false,
  });

  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [statusVal, setStatusVal] = useState(filters.service_status ?? "all");
  const [typeVal, setTypeVal] = useState(filters.type ?? "all");
  const [qVal, setQVal] = useState(filters.q ?? "");
  const [modelVal, setModelVal] = useState(filters.model_id ?? "all");

  function applyFilters() {
    const params = new URLSearchParams(searchParams.toString());
    const set = (k: string, v: string) => {
      if (v && v !== "all" && v !== "") params.set(k, v);
      else params.delete(k);
    };
    set("service_status", statusVal);
    set("type", typeVal);
    set("q", qVal);
    set("model_id", modelVal);
    startTransition(() => {
      router.push(`/parts/aftersales/customers?${params.toString()}`);
    });
  }

  function resetFilters() {
    setStatusVal("all");
    setTypeVal("all");
    setQVal("");
    setModelVal("all");
    startTransition(() => {
      router.push("/parts/aftersales/customers");
    });
  }

  // 在 UI 層做服務狀態 filter（helper 沒做這 axis 的 server filter；本頁強調這欄）
  const filteredRows = useMemo(() => {
    if (statusVal === "all") return rows;
    return rows.filter((r) => r.service_status === statusVal);
  }, [rows, statusVal]);

  const columns: DataGridColumn<AftersalesCustomerBaseRow>[] = useMemo(
    () => [
      {
        id: "avatar",
        header: "",
        width: 48,
        sortable: false,
        hideable: true,
        cell: (r) => (
          <Link
            href={`/parts/aftersales/customers/${r.id}`}
            className="block w-8 h-8 rounded-full overflow-hidden border border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-center"
            title={r.name}
          >
            {r.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={r.avatar_url}
                alt={r.name}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <span className="text-[11px] text-[#9A9890] font-medium">
                {r.name.slice(0, 1)}
              </span>
            )}
          </Link>
        ),
        exportValue: () => "",
      },
      {
        id: "code",
        header: "客戶編號",
        width: 140,
        hideable: false,
        cell: (r) => (
          <Link
            href={`/parts/aftersales/customers/${r.id}`}
            className="font-mono font-semibold text-[#1A3A5C] hover:text-[#185FA5] hover:underline text-[11.5px]"
          >
            {r.code}
          </Link>
        ),
        exportValue: (r) => r.code,
        sortValue: (r) => r.code,
      },
      {
        id: "name",
        header: "車主",
        width: 170,
        cell: (r) => (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[12.5px] text-[#2C2C2A] font-medium">
              {r.name}
            </span>
            <span
              className={`inline-flex px-1.5 py-0.5 rounded-md text-[11px] font-medium ${typeChip(r.type)}`}
            >
              {r.type === "corporate" ? "企業" : "個人"}
            </span>
            {isVipRow(r) && (
              <span
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[11px] font-semibold bg-tone-amber-50 text-tone-amber-700 border border-tone-amber-100"
                title="VIP — 累計回廠 ≥ 3 次 或 名下車輛 ≥ 2 台"
              >
                ★ VIP
              </span>
            )}
          </div>
        ),
        exportValue: (r) =>
          `${r.name}${r.type === "corporate" ? "（企業）" : ""}${isVipRow(r) ? "（VIP）" : ""}`,
        sortValue: (r) => r.name,
      },
      {
        id: "phone",
        header: "聯絡電話",
        width: 130,
        cell: (r) => (
          <span className="font-mono text-[12px] text-[#5A5955]">
            {r.phone ?? <span className="text-[#9A9890]">—</span>}
          </span>
        ),
        exportValue: (r) => r.phone ?? "",
        sortValue: (r) => r.phone ?? "",
      },
      {
        id: "vehicle",
        header: "主車輛 / 里程",
        width: 170,
        cell: (r) => (
          <div className="flex flex-col leading-tight">
            <span className="font-mono text-[12px] text-[#2C2C2A]">
              {r.primary_license_plate ?? (
                <span className="text-[#9A9890]">—</span>
              )}
              {r.vehicle_count > 1 ? (
                <span className="ml-1 text-[10.5px] text-[#185FA5]">
                  +{r.vehicle_count - 1}
                </span>
              ) : null}
            </span>
            <span className="text-[11px] text-[#9A9890] font-mono">
              {fmtMileage(r.primary_mileage)}
            </span>
          </div>
        ),
        exportValue: (r) =>
          `${r.primary_license_plate ?? ""}${r.vehicle_count > 1 ? ` (+${r.vehicle_count - 1})` : ""} ${fmtMileage(r.primary_mileage)}`,
        sortValue: (r) => r.primary_license_plate ?? "",
      },
      {
        id: "visits",
        header: "累計回廠",
        width: 90,
        align: "right",
        cell: (r) => (
          <span className="font-mono text-[12.5px] text-[#1A3A5C] font-semibold">
            {r.visit_count}{" "}
            <span className="text-[10.5px] font-normal text-[#9A9890]">次</span>
          </span>
        ),
        exportValue: (r) => String(r.visit_count),
        sortValue: (r) => r.visit_count,
      },
      {
        id: "last_visit",
        header: "上次回廠",
        width: 150,
        cell: (r) => (
          <div className="flex flex-col leading-tight">
            <span className="font-mono text-[12px] text-[#5A5955]">
              {fmtDate(r.last_visit_at)}
            </span>
            <span className="text-[11px] text-[#9A9890] font-mono">
              {r.last_ro_no ?? "—"}
            </span>
          </div>
        ),
        exportValue: (r) =>
          `${fmtDate(r.last_visit_at)} ${r.last_ro_no ?? ""}`.trim(),
        sortValue: (r) => r.last_visit_at ?? "",
      },
      {
        id: "next_due",
        header: "下次保養",
        width: 110,
        cell: (r) => (
          <span className="font-mono text-[12px] text-[#5A5955]">
            {fmtDate(r.next_due_date)}
          </span>
        ),
        exportValue: (r) => fmtDate(r.next_due_date),
        sortValue: (r) => r.next_due_date ?? "",
      },
      {
        id: "status",
        header: "服務狀態",
        width: 100,
        cell: (r) => (
          <span
            className={`inline-flex whitespace-nowrap px-1.5 py-0.5 rounded-md text-[11px] font-medium ${serviceChip(r.service_status)}`}
          >
            {SERVICE_STATUS_LABEL[r.service_status]}
          </span>
        ),
        exportValue: (r) => SERVICE_STATUS_LABEL[r.service_status],
        sortValue: (r) => r.service_status,
      },
    ],
    [],
  );

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">人車檔案</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          售後 · 9
        </span>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#F0EFFE] text-[#534AB7] font-semibold">
          ★5
        </span>
        <span className="text-[12px] text-[#9A9890]">
          車主 / 車輛 / 維修履歷 主檔 · 售後接待視角
        </span>
      </header>

      {/* KpiCard 列 — 售後接待視角四指標 */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="總客戶"
          value={kpi.total_customers.toLocaleString()}
          tone="blue"
          icon={<span className="text-[16px]">👥</span>}
        />
        <KpiCard
          label="VIP 客戶（≥3 次 或 ≥2 車）"
          value={kpi.vip_count.toLocaleString()}
          tone="amber"
          icon={<span className="text-[16px]">★</span>}
        />
        <KpiCard
          label="本月進廠數"
          value={kpi.this_month_visits.toLocaleString()}
          tone="green"
          icon={<span className="text-[16px]">🛠</span>}
        />
        <KpiCard
          label="待回廠 / 流失邊緣"
          value={kpi.at_risk_dormant.toLocaleString()}
          tone={kpi.at_risk_dormant > 0 ? "red" : "gray"}
          icon={<span className="text-[16px]">⚠</span>}
        />
      </section>

      {/* ★5 跨模組 banner — 連到 CRM 售後客戶基盤（同一批 customers、不同視角） */}
      <section className="bg-[#F0EFFE] border border-[#C4BEF0] rounded-lg px-4 py-2.5 flex items-center gap-3 flex-wrap">
        <span className="text-[11px] text-[#534AB7] font-semibold">
          ★5 跨模組
        </span>
        <span className="text-[12px] text-[#26215C]">
          本頁是<strong>售後接待視角</strong>（進廠 / 保固 / 主車輛）；同一批客戶在
          <strong>CRM 視角</strong>強調 NPS / 預約 / 行銷標籤。
        </span>
        <Link
          href="/crm/aftersales/customer-base"
          className="ml-auto h-[26px] px-3 rounded-full text-[11.5px] inline-flex items-center bg-[#534AB7] text-white hover:bg-[#3F3793] font-medium"
        >
          切換到 CRM 視角 →
        </Link>
      </section>

      {/* Filter bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>車主 / 車牌 / 電話</label>
            <input
              className={`${inputClass} w-[220px]`}
              value={qVal}
              onChange={(e) => setQVal(e.target.value)}
              placeholder="車主姓名 / 車牌 / 電話 / 統編"
              onKeyDown={(e) => {
                if (e.key === "Enter") applyFilters();
              }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>類型</label>
            <select
              className={inputClass}
              value={typeVal}
              onChange={(e) => setTypeVal(e.target.value)}
            >
              <option value="all">全部</option>
              <option value="individual">個人</option>
              <option value="corporate">企業</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>服務狀態</label>
            <select
              className={inputClass}
              value={statusVal}
              onChange={(e) => setStatusVal(e.target.value)}
            >
              <option value="all">全部</option>
              <option value="active_service">服務中</option>
              <option value="at_risk">待回廠</option>
              <option value="dormant">流失邊緣</option>
              <option value="unknown">尚未進廠</option>
            </select>
          </div>
          {/* 車型篩選（依主車輛 model_id） */}
          {models.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className={labelClass}>車型</label>
              <select
                className={inputClass}
                value={modelVal}
                onChange={(e) => setModelVal(e.target.value)}
              >
                <option value="all">全部車型</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.display_name}
                  </option>
                ))}
              </select>
            </div>
          )}
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
            {canEdit && (
              <Link
                href="/admin/master-data/customers/new?ref=aftersales"
                className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] inline-flex items-center disabled:opacity-50"
              >
                ＋ 新增客戶
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          人車檔案 · 共{" "}
          <b className="text-[#2C2C2A]">{filteredRows.length}</b> / {totalCount}{" "}
          筆
        </span>
      </div>

      <DataGrid
        columns={columns}
        data={filteredRows}
        rowKey={(r) => r.id}
        persistKey="parts/aftersales/customers"
        exportFileName="aftersales-customers"
        emptyMessage="輸入車主姓名 / 車牌 / 電話查詢，或調整服務狀態"
        disabled={isPending}
        rowActionsWidth={170}
        rowActions={(r) => (
          <div className="flex gap-1.5">
            <Link
              href={`/parts/aftersales/customers/${r.id}`}
              className="h-[26px] px-2.5 rounded text-[11.5px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              查看
            </Link>
            <Link
              href={`/admin/master-data/customers/${r.id}`}
              className="h-[26px] px-2.5 rounded text-[11.5px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              主檔
            </Link>
          </div>
        )}
      />
    </main>
  );
}
