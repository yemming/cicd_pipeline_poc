"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  upsertMappingAction,
  deleteMappingAction,
  seedDefaultMappingsAction,
  type MappingInput,
} from "@/lib/accounting/netsuite-mapping-actions";
import type { MappingRow } from "@/lib/accounting/queries";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { useSetPageHeader } from "@/components/page-header-context";

type Banner = { ok: boolean; msg: string } | null;

const STATUS_CHIP: Record<string, string> = {
  OK: "bg-[#EAF3DE] text-[#3B6D11]",
  STALE: "bg-[#FDF3E3] text-[#854F0B]",
  CONFLICT: "bg-[#FDECEA] text-[#CC0000]",
};
const SEGMENT_CHIP: Record<string, string> = {
  native: "bg-[#EAF4FB] text-[#185FA5]",
  custom: "bg-[#F2EAFB] text-[#5E2EA0]",
};

export function MappingBoard({
  rows,
  totalCount,
  filters,
}: {
  rows: MappingRow[];
  totalCount: number;
  filters: { dim?: string };
}) {
  useSetPageHeader({
    title: "NetSuite Mapping 表",
    breadcrumb: [
      { label: "會計財務設定", href: "/admin/accounting/coa" },
      { label: "Mapping 表" },
    ],
  });
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [showAdd, setShowAdd] = useState(false);

  const [fDim, setFDim] = useState(filters.dim ?? "all");

  const [aDim, setADim] = useState("SUBSIDIARY");
  const [aDealId, setADealId] = useState("");
  const [aNsId, setANsId] = useState("");
  const [aNsExt, setANsExt] = useState("");
  const [aType, setAType] = useState<"native" | "custom">("native");
  const [aScript, setAScript] = useState("subsidiary");
  const [aNotes, setANotes] = useState("");

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const submitFilters = () => {
    const p = new URLSearchParams();
    if (fDim !== "all") p.set("dim", fDim);
    const qs = p.toString();
    startTransition(() => {
      router.push(
        qs
          ? `/admin/accounting/netsuite-mapping?${qs}`
          : "/admin/accounting/netsuite-mapping",
      );
    });
  };

  const seedDefault = () => {
    if (!confirm("從現有 subsidiaries / organizations / departments / brands / vehicle_models 自動產生 placeholder mapping？\n\n（已存在的對映不會覆蓋）")) return;
    startTransition(async () => {
      const res = await seedDefaultMappingsAction();
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已自動產生 ${res.data.inserted} 筆預設對映` });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const removeRow = (r: MappingRow) => {
    if (!confirm(`刪除對映「${r.dealeros_dim} ${r.dealeros_id} → ${r.netsuite_internal_id}」？`))
      return;
    startTransition(async () => {
      const res = await deleteMappingAction(r.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const submitAdd = () => {
    const input: MappingInput = {
      dealeros_dim: aDim,
      dealeros_id: aDealId,
      netsuite_internal_id: aNsId,
      netsuite_external_id: aNsExt || null,
      netsuite_segment_type: aType,
      netsuite_segment_script_id: aScript || null,
      sync_notes: aNotes || null,
    };
    startTransition(async () => {
      const res = await upsertMappingAction(input);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存對映" });
        setShowAdd(false);
        setADealId("");
        setANsId("");
        setANsExt("");
        setANotes("");
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

  // group dim type counts
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.dealeros_dim] = (counts[r.dealeros_dim] ?? 0) + 1;

  const columns: DataGridColumn<MappingRow>[] = [
    {
      id: "dealeros_dim",
      header: "DealerOS 維度",
      width: 120,
      hideable: false,
      cell: (r) => (
        <span className="font-mono font-semibold text-[#1A3A5C]">{r.dealeros_dim}</span>
      ),
      exportValue: (r) => r.dealeros_dim,
      sortValue: (r) => r.dealeros_dim,
    },
    {
      id: "dealeros_id",
      header: "DealerOS ID",
      cell: (r) => (
        <span className="font-mono text-[11.5px] text-[#5A5955]">{r.dealeros_id}</span>
      ),
      exportValue: (r) => r.dealeros_id,
      sortValue: (r) => r.dealeros_id,
    },
    {
      id: "netsuite_internal_id",
      header: "NetSuite Internal ID",
      width: 140,
      cell: (r) => <span className="font-mono">{r.netsuite_internal_id}</span>,
      exportValue: (r) => r.netsuite_internal_id,
      sortValue: (r) => r.netsuite_internal_id,
    },
    {
      id: "netsuite_external_id",
      header: "NetSuite External",
      width: 130,
      cell: (r) => (
        <span className="font-mono text-[11.5px] text-[#5A5955]">
          {r.netsuite_external_id ?? "—"}
        </span>
      ),
      exportValue: (r) => r.netsuite_external_id ?? "",
      sortValue: (r) => r.netsuite_external_id ?? "",
    },
    {
      id: "netsuite_segment_type",
      header: "Segment 類型",
      width: 110,
      cell: (r) =>
        r.netsuite_segment_type ? (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${
              SEGMENT_CHIP[r.netsuite_segment_type] ?? ""
            }`}
          >
            {r.netsuite_segment_type}
          </span>
        ) : (
          <span className="text-[#9A9890]">—</span>
        ),
      exportValue: (r) => r.netsuite_segment_type ?? "",
      sortValue: (r) => r.netsuite_segment_type ?? "",
    },
    {
      id: "netsuite_segment_script_id",
      header: "Script ID",
      width: 150,
      cell: (r) => (
        <span className="font-mono text-[11.5px] text-[#5A5955]">
          {r.netsuite_segment_script_id ?? "—"}
        </span>
      ),
      exportValue: (r) => r.netsuite_segment_script_id ?? "",
      sortValue: (r) => r.netsuite_segment_script_id ?? "",
    },
    {
      id: "sync_status",
      header: "狀態",
      width: 80,
      cell: (r) => (
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${
            STATUS_CHIP[r.sync_status] ?? "bg-[#F2F2F2] text-[#6B6A68]"
          }`}
        >
          {r.sync_status}
        </span>
      ),
      exportValue: (r) => r.sync_status,
      sortValue: (r) => r.sync_status,
    },
    {
      id: "synced_at",
      header: "同步時間",
      width: 150,
      cell: (r) => (
        <span className="text-[11.5px] text-[#5A5955]">
          {new Date(r.synced_at).toLocaleString("zh-TW")}
        </span>
      ),
      exportValue: (r) => r.synced_at,
      sortValue: (r) => r.synced_at,
    },
  ];

  return (
    <main className={`px-6 py-5 space-y-3 ${lockedClass}`}>
      {/* Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">Mapping 表</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          DealerOS ↔ NetSuite
        </span>
        <span className="text-[12px] text-[#9A9890]">
          中臺維度對映 (Silver 層) ・ ETL Bronze→Silver 翻譯依據
        </span>
      </header>

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

      {/* Filter + actions */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>維度</label>
            <select className={inputClass} value={fDim} onChange={(e) => setFDim(e.target.value)}>
              <option value="all">全部</option>
              <option value="SUBSIDIARY">SUBSIDIARY (法人)</option>
              <option value="STORE">STORE (門店)</option>
              <option value="DEPT">DEPT (部門)</option>
              <option value="BRAND">BRAND (品牌)</option>
              <option value="MODEL">MODEL (車型)</option>
              <option value="MODEL_LINE">MODEL_LINE (車系)</option>
              <option value="VEHICLE">VEHICLE</option>
              <option value="EMPLOYEE">EMPLOYEE</option>
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
              onClick={seedDefault}
              disabled={isPending}
              className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              ⚡ 自動產生預設對映
            </button>
            <button
              onClick={() => setShowAdd(true)}
              disabled={isPending}
              className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
            >
              ＋ 新增對映
            </button>
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{totalCount}</b> 筆對映
          {Object.keys(counts).length > 0 && (
            <>
              {" ・ "}
              {Object.entries(counts)
                .map(([k, v]) => `${k}=${v}`)
                .join(", ")}
            </>
          )}
        </span>
      </div>

      {/* Table */}
      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="admin/accounting/netsuite-mapping"
        exportFileName="netsuite-mapping"
        emptyMessage="尚無對映 — 點「⚡ 自動產生預設對映」批次產生 placeholder"
        disabled={isPending}
        rowActionsWidth={80}
        rowActions={(r) => (
          <button
            onClick={() => removeRow(r)}
            disabled={isPending}
            className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-40"
          >
            刪除
          </button>
        )}
      />

      {/* Add Modal */}
      {showAdd && (
        <div
          className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center"
          onClick={() => !isPending && setShowAdd(false)}
        >
          <div
            className="bg-white rounded-lg shadow-2xl p-5 w-[520px] max-w-[92vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-[14px] font-semibold mb-4">＋ 新增/更新對映</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>DealerOS 維度 *</label>
                  <select
                    className={inputClass}
                    value={aDim}
                    onChange={(e) => setADim(e.target.value)}
                  >
                    <option value="SUBSIDIARY">SUBSIDIARY</option>
                    <option value="STORE">STORE</option>
                    <option value="DEPT">DEPT</option>
                    <option value="BRAND">BRAND</option>
                    <option value="MODEL">MODEL</option>
                    <option value="MODEL_LINE">MODEL_LINE</option>
                    <option value="VEHICLE">VEHICLE</option>
                    <option value="EMPLOYEE">EMPLOYEE</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>DealerOS ID *</label>
                  <input className={inputClass} value={aDealId} onChange={(e) => setADealId(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>NetSuite Internal ID *</label>
                  <input className={inputClass} value={aNsId} onChange={(e) => setANsId(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>NetSuite External Code</label>
                  <input className={inputClass} value={aNsExt} onChange={(e) => setANsExt(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>Segment 類型</label>
                  <select
                    className={inputClass}
                    value={aType}
                    onChange={(e) => setAType(e.target.value as "native" | "custom")}
                  >
                    <option value="native">Native (subsidiary/department/class/location)</option>
                    <option value="custom">Custom Segment</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>Script ID</label>
                  <input className={inputClass} value={aScript} onChange={(e) => setAScript(e.target.value)} />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>備註</label>
                <input className={inputClass} value={aNotes} onChange={(e) => setANotes(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowAdd(false)}
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                onClick={submitAdd}
                disabled={isPending || !aDealId || !aNsId}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
              >
                {isPending ? "儲存中⋯" : "儲存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
