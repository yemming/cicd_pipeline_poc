"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  deleteDimensionAction,
  setDimensionActiveAction,
} from "@/lib/accounting/dimension-actions";
import type { DimensionRow } from "@/lib/accounting/queries";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";

type Banner = { ok: boolean; msg: string } | null;

export type DimensionFilterState = {
  q?: string;
  scope?: string;
  segment?: string;
  status?: string;
};

const SEGMENT_LABEL: Record<string, string> = {
  native: "Native",
  custom: "Custom Segment",
};
const SEGMENT_CHIP: Record<string, string> = {
  native: "bg-[#EAF4FB] text-[#185FA5]",
  custom: "bg-[#F2EAFB] text-[#5E2EA0]",
};

export function DimensionsBoard({
  rows,
  totalCount,
  filters,
}: {
  rows: DimensionRow[];
  totalCount: number;
  filters: DimensionFilterState;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const [fQ, setFQ] = useState(filters.q ?? "");
  const [fScope, setFScope] = useState(filters.scope ?? "all");
  const [fSegment, setFSegment] = useState(filters.segment ?? "all");
  const [fStatus, setFStatus] = useState(filters.status ?? "all");

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const submitFilters = () => {
    const p = new URLSearchParams();
    if (fQ.trim()) p.set("q", fQ.trim());
    if (fScope !== "all") p.set("scope", fScope);
    if (fSegment !== "all") p.set("segment", fSegment);
    if (fStatus !== "all") p.set("status", fStatus);
    const qs = p.toString();
    startTransition(() => {
      router.push(
        qs
          ? `/admin/accounting/dimensions?${qs}`
          : "/admin/accounting/dimensions",
      );
    });
  };
  const resetFilters = () => {
    setFQ("");
    setFScope("all");
    setFSegment("all");
    setFStatus("all");
    startTransition(() => router.push("/admin/accounting/dimensions"));
  };

  const toggleActive = (r: DimensionRow) => {
    if (r.is_system_default && r.is_active) {
      showBanner({ ok: false, msg: "系統預設維度不可停用" });
      return;
    }
    startTransition(async () => {
      const res = await setDimensionActiveAction(r.id, !r.is_active);
      if (res.ok) {
        showBanner({ ok: true, msg: r.is_active ? "✓ 已停用" : "✓ 已啟用" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const removeRow = (r: DimensionRow) => {
    if (r.is_system_default) {
      showBanner({ ok: false, msg: "系統預設維度不可刪除" });
      return;
    }
    if (!confirm(`刪除維度「${r.dimension_code} ${r.dimension_name}」？`)) return;
    startTransition(async () => {
      const res = await deleteDimensionAction(r.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";
  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  const systemCount = rows.filter((r) => r.is_system_default).length;
  const tenantCount = rows.length - systemCount;

  const columns: DataGridColumn<DimensionRow>[] = [
    {
      id: "dimension_code",
      header: "維度代碼",
      width: 160,
      hideable: false,
      cell: (r) => (
        <Link
          href={`/admin/accounting/dimensions/${r.id}`}
          className="font-mono font-semibold text-[#1A3A5C] hover:underline"
        >
          {r.dimension_code}
        </Link>
      ),
      exportValue: (r) => r.dimension_code,
      sortValue: (r) => r.dimension_code,
    },
    {
      id: "dimension_name",
      header: "中文名",
      width: 180,
      cell: (r) => (
        <Link
          href={`/admin/accounting/dimensions/${r.id}`}
          className="text-[#185FA5] hover:underline"
        >
          {r.dimension_name}
        </Link>
      ),
      exportValue: (r) => r.dimension_name,
      sortValue: (r) => r.dimension_name,
    },
    {
      id: "description",
      header: "說明",
      cell: (r) => (
        <span className="text-[11.5px] text-[#5A5955]">
          {r.description ?? "—"}
        </span>
      ),
      exportValue: (r) => r.description ?? "",
      sortValue: (r) => r.description ?? "",
    },
    {
      id: "reference_table",
      header: "對映表",
      width: 160,
      cell: (r) => (
        <span className="font-mono text-[11.5px] text-[#5A5955]">
          {r.reference_table ?? "—"}
        </span>
      ),
      exportValue: (r) => r.reference_table ?? "",
      sortValue: (r) => r.reference_table ?? "",
    },
    {
      id: "reference_value_column",
      header: "取值欄位",
      width: 110,
      cell: (r) => (
        <span className="font-mono text-[11.5px] text-[#5A5955]">
          {r.reference_value_column ?? "—"}
        </span>
      ),
      exportValue: (r) => r.reference_value_column ?? "",
      sortValue: (r) => r.reference_value_column ?? "",
    },
    {
      id: "netsuite_segment_type",
      header: "NetSuite Segment",
      width: 140,
      cell: (r) =>
        r.netsuite_segment_type ? (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${
              SEGMENT_CHIP[r.netsuite_segment_type] ?? ""
            }`}
          >
            {SEGMENT_LABEL[r.netsuite_segment_type] ?? r.netsuite_segment_type}
          </span>
        ) : (
          <span className="text-[#9A9890]">—</span>
        ),
      exportValue: (r) =>
        r.netsuite_segment_type
          ? SEGMENT_LABEL[r.netsuite_segment_type] ?? r.netsuite_segment_type
          : "",
      sortValue: (r) => r.netsuite_segment_type ?? "",
    },
    {
      id: "netsuite_segment_script_id",
      header: "Script ID",
      width: 110,
      cell: (r) => (
        <span className="font-mono text-[11.5px] text-[#5A5955]">
          {r.netsuite_segment_script_id ?? "—"}
        </span>
      ),
      exportValue: (r) => r.netsuite_segment_script_id ?? "",
      sortValue: (r) => r.netsuite_segment_script_id ?? "",
    },
    {
      id: "is_system_default",
      header: "來源",
      width: 80,
      cell: (r) =>
        r.is_system_default ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#EAF4FB] text-[#185FA5]">
            系統
          </span>
        ) : (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#FDF3E3] text-[#854F0B]">
            集團
          </span>
        ),
      exportValue: (r) => (r.is_system_default ? "系統" : "集團"),
      sortValue: (r) => r.is_system_default,
    },
    {
      id: "is_active",
      header: "狀態",
      width: 80,
      cell: (r) =>
        r.is_active ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#EAF3DE] text-[#3B6D11]">
            啟用
          </span>
        ) : (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#F2F2F2] text-[#6B6A68]">
            停用
          </span>
        ),
      exportValue: (r) => (r.is_active ? "啟用" : "停用"),
      sortValue: (r) => r.is_active,
    },
  ];

  return (
    <main className={`px-6 py-5 space-y-3 ${lockedClass}`}>
      {/* 1. Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">統計科目表</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          GL Dimensions
        </span>
        <span className="text-[12px] text-[#9A9890]">
          GL 分析維度主檔・對映 NetSuite Native Segment + Custom Segment
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

      {/* Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>關鍵字</label>
            <input
              className={inputClass}
              placeholder="維度代碼 / 名稱 / 表名"
              value={fQ}
              onChange={(e) => setFQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitFilters()}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>來源</label>
            <select
              className={inputClass}
              value={fScope}
              onChange={(e) => setFScope(e.target.value)}
            >
              <option value="all">全部</option>
              <option value="system">系統預設</option>
              <option value="tenant">本集團自訂</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>NetSuite Segment</label>
            <select
              className={inputClass}
              value={fSegment}
              onChange={(e) => setFSegment(e.target.value)}
            >
              <option value="all">全部</option>
              <option value="native">Native (4 個原生)</option>
              <option value="custom">Custom Segment</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>狀態</label>
            <select
              className={inputClass}
              value={fStatus}
              onChange={(e) => setFStatus(e.target.value)}
            >
              <option value="all">全部</option>
              <option value="active">啟用</option>
              <option value="inactive">停用</option>
            </select>
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={submitFilters}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "查詢中⋯" : "查詢"}
            </button>
            <button
              onClick={resetFilters}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
            <button
              onClick={() => router.push("/admin/accounting/dimensions/new")}
              disabled={isPending}
              className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
            >
              ＋ 新增維度
            </button>
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{totalCount}</b> 筆維度（系統{" "}
          <b>{systemCount}</b> ・本集團 <b>{tenantCount}</b>）
        </span>
      </div>

      {/* Table */}
      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="admin/accounting/dimensions"
        exportFileName="gl-dimensions"
        emptyMessage="沒有符合條件的維度"
        rowActions={(r) => (
          <>
            <button
              onClick={() => router.push(`/admin/accounting/dimensions/${r.id}`)}
              disabled={isPending}
              className="h-[26px] px-2.5 rounded text-[11.5px] whitespace-nowrap bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              編輯
            </button>
            <button
              onClick={() => toggleActive(r)}
              disabled={isPending || (r.is_system_default && r.is_active)}
              className="h-[26px] px-2.5 rounded text-[11.5px] whitespace-nowrap bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              {r.is_active ? "停用" : "啟用"}
            </button>
            <button
              onClick={() => removeRow(r)}
              disabled={isPending || r.is_system_default}
              className="h-[26px] px-2.5 rounded text-[11.5px] whitespace-nowrap bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-40"
            >
              刪除
            </button>
          </>
        )}
      />
    </main>
  );
}
