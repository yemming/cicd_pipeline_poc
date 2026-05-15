"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { useSetPageHeader } from "@/components/page-header-context";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import {
  PREFIX_P1_DEFS,
  PREFIX_P2_DEFS,
  RO_STATUS_OPTIONS,
} from "@/domain/repair-orders.constants";
import type {
  RepairOrderListFilters,
  RepairOrderListPageData,
  RepairOrderListRow,
} from "@/domain/repair-orders";

const labelClass = "text-[11px] text-[#9A9890] font-medium";
const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none bg-white";

function statusChipClass(status: string): string {
  switch (status) {
    case "進行中":
      return "bg-[#EAF4FB] text-[#185FA5]";
    case "維修中":
      return "bg-[#FDF3E3] text-[#854F0B]";
    case "待結帳":
      return "bg-[#EBF3FF] text-[#1A3A5C]";
    case "已關單":
      return "bg-[#EAF3DE] text-[#3B6D11]";
    case "已取消":
      return "bg-[#F2F2F2] text-[#6B6A68]";
    default:
      return "bg-[#F2F2F2] text-[#6B6A68]";
  }
}

function p1ChipClass(p1: string): string {
  switch (p1) {
    case "MN":
      return "bg-[#E5F5EE] text-[#0F6E56]";
    case "RP":
      return "bg-[#EAF4FB] text-[#185FA5]";
    case "WC":
      return "bg-[#FDF3E3] text-[#854F0B]";
    case "AC":
      return "bg-[#FDECEA] text-[#CC0000]";
    case "OT":
      return "bg-[#F0EFFE] text-[#534AB7]";
    default:
      return "bg-[#F2F2F2] text-[#6B6A68]";
  }
}

export function RepairOrdersBoard({
  data,
  filters,
  canEdit,
}: {
  data: RepairOrderListPageData;
  filters: RepairOrderListFilters;
  canEdit: boolean;
}) {
  useSetPageHeader({
    title: "正式工單 RO",
    breadcrumb: [
      { label: "售後修護", href: "/parts/aftersales" },
      { label: "正式工單 RO" },
    ],
    hideSearch: false,
  });

  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // 篩選條件本地 state（送出才推 URL）
  const [statusVal, setStatusVal] = useState(filters.status ?? "all");
  const [p1Val, setP1Val] = useState(filters.prefix_p1 ?? "all");
  const [p2Val, setP2Val] = useState(filters.prefix_p2 ?? "all");
  const [qVal, setQVal] = useState(filters.q ?? "");

  function applyFilters() {
    const params = new URLSearchParams(searchParams.toString());
    const set = (k: string, v: string) => {
      if (v && v !== "all" && v !== "") params.set(k, v);
      else params.delete(k);
    };
    set("status", statusVal);
    set("prefix_p1", p1Val);
    set("prefix_p2", p2Val);
    set("q", qVal);
    startTransition(() => {
      router.push(`/parts/aftersales/repair-orders?${params.toString()}`);
    });
  }

  function resetFilters() {
    setStatusVal("all");
    setP1Val("all");
    setP2Val("all");
    setQVal("");
    startTransition(() => {
      router.push("/parts/aftersales/repair-orders");
    });
  }

  const columns: DataGridColumn<RepairOrderListRow>[] = useMemo(
    () => [
      {
        id: "ro_code",
        header: "工單編號",
        width: 180,
        hideable: false,
        cell: (r) => (
          <Link
            href={`/parts/aftersales/repair-orders/${r.id}`}
            className="font-mono font-semibold text-[#1A3A5C] hover:text-[#185FA5] hover:underline"
          >
            {r.ro_code}
          </Link>
        ),
        exportValue: (r) => r.ro_code,
        sortValue: (r) => r.ro_code,
      },
      {
        id: "issue_date",
        header: "開單日",
        width: 100,
        cell: (r) => <span className="text-[#5A5955]">{r.issue_date}</span>,
        exportValue: (r) => r.issue_date,
        sortValue: (r) => r.issue_date,
      },
      {
        id: "prefix",
        header: "業務 / 付款",
        width: 130,
        cell: (r) => (
          <span className="inline-flex gap-1">
            <span
              className={`inline-flex px-1.5 py-0.5 rounded-md text-[11px] font-medium ${p1ChipClass(r.prefix_p1)}`}
            >
              {r.prefix_p1}
            </span>
            <span className="inline-flex px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#EBF3FF] text-[#1A3A5C]">
              {r.prefix_p2}
            </span>
          </span>
        ),
        exportValue: (r) => `${r.prefix_p1}-${r.prefix_p2}`,
        sortValue: (r) => `${r.prefix_p1}-${r.prefix_p2}`,
      },
      {
        id: "customer",
        header: "車主",
        width: 110,
        cell: (r) => r.customer_name ?? <span className="text-[#9A9890]">—</span>,
        exportValue: (r) => r.customer_name ?? "",
        sortValue: (r) => r.customer_name ?? "",
      },
      {
        id: "vehicle",
        header: "車牌 / 車型",
        width: 170,
        cell: (r) =>
          r.vehicle_license_plate ? (
            <span>
              <span className="font-mono">{r.vehicle_license_plate}</span>
              <span className="text-[#9A9890] ml-1">
                {r.vehicle_model_name ? `· ${r.vehicle_model_name}` : ""}
              </span>
            </span>
          ) : (
            <span className="text-[#9A9890]">—</span>
          ),
        exportValue: (r) =>
          [r.vehicle_license_plate, r.vehicle_model_name].filter(Boolean).join(" · "),
        sortValue: (r) => r.vehicle_license_plate ?? "",
      },
      {
        id: "mileage",
        header: "進廠里程",
        width: 100,
        align: "right",
        cell: (r) =>
          r.mileage_in != null ? (
            <span className="font-mono text-[#5A5955]">{r.mileage_in.toLocaleString()} km</span>
          ) : (
            <span className="text-[#9A9890]">—</span>
          ),
        exportValue: (r) => (r.mileage_in != null ? String(r.mileage_in) : ""),
        sortValue: (r) => r.mileage_in ?? -1,
      },
      {
        id: "estimated_subtotal",
        header: "預估金額",
        width: 110,
        align: "right",
        cell: (r) =>
          r.estimated_subtotal != null ? (
            <span className="font-mono text-[#1A3A5C] font-semibold">
              NT${Number(r.estimated_subtotal).toLocaleString()}
            </span>
          ) : (
            <span className="text-[#9A9890]">—</span>
          ),
        exportValue: (r) =>
          r.estimated_subtotal != null ? String(r.estimated_subtotal) : "",
        sortValue: (r) => Number(r.estimated_subtotal ?? 0),
      },
      {
        id: "status",
        header: "狀態",
        width: 90,
        cell: (r) => (
          <span
            className={`inline-flex whitespace-nowrap px-1.5 py-0.5 rounded-md text-[11px] font-medium ${statusChipClass(r.status)}`}
          >
            {r.status}
          </span>
        ),
        exportValue: (r) => r.status,
        sortValue: (r) => r.status,
      },
      {
        id: "opened_at",
        header: "開單時間",
        width: 150,
        cell: (r) =>
          r.opened_at ? (
            <span className="text-[12px] text-[#5A5955]">
              {new Date(r.opened_at).toLocaleString("zh-TW", {
                timeZone: "Asia/Taipei",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          ) : (
            <span className="text-[#9A9890]">—</span>
          ),
        exportValue: (r) => r.opened_at ?? "",
        sortValue: (r) => r.opened_at ?? "",
      },
    ],
    [],
  );

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">正式工單 RO</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          Sprint Aftersales
        </span>
        <span className="text-[12px] text-[#9A9890]">售後 pipeline 開單入口 · 預檢轉 RO 後可派工 / 領料 / 結帳</span>
      </header>

      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>狀態</label>
            <select
              className={inputClass}
              value={statusVal}
              onChange={(e) => setStatusVal(e.target.value)}
            >
              <option value="all">全部</option>
              {RO_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>業務類型</label>
            <select
              className={inputClass}
              value={p1Val}
              onChange={(e) => setP1Val(e.target.value)}
            >
              <option value="all">全部</option>
              {PREFIX_P1_DEFS.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.code} {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>付款性質</label>
            <select
              className={inputClass}
              value={p2Val}
              onChange={(e) => setP2Val(e.target.value)}
            >
              <option value="all">全部</option>
              {PREFIX_P2_DEFS.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.code} {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>關鍵字（工單編號）</label>
            <input
              className={inputClass}
              value={qVal}
              onChange={(e) => setQVal(e.target.value)}
              placeholder="MN-CP-260515-001"
              onKeyDown={(e) => {
                if (e.key === "Enter") applyFilters();
              }}
            />
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
            {canEdit && (
              <Link
                href="/parts/aftersales/repair-orders/new"
                className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] flex items-center"
              >
                ＋ 新增 RO（從預檢/預約轉）
              </Link>
            )}
          </div>
        </div>
      </section>

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{data.totalCount}</b> 筆工單
        </span>
      </div>

      <DataGrid
        columns={columns}
        data={data.rows}
        rowKey={(r) => r.id}
        persistKey="parts/aftersales/repair-orders"
        exportFileName="repair-orders"
        emptyMessage="目前沒有符合條件的工單"
        disabled={isPending}
        rowActionsWidth={170}
        rowActions={(r) => (
          <Link
            href={`/parts/aftersales/repair-orders/${r.id}`}
            className="h-[26px] px-2.5 rounded text-[11.5px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            查看詳情
          </Link>
        )}
      />
    </main>
  );
}
