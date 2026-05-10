"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createDimensionAction,
  setDimensionActiveAction,
  deleteDimensionAction,
  updateDimensionAction,
  listCoaUsingDimensionAction,
  type DimensionInput,
  type CoaUsingDim,
} from "@/lib/accounting/dimension-actions";
import type { DimensionRow } from "@/lib/accounting/queries";

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
  const [showCreate, setShowCreate] = useState(false);

  const [fQ, setFQ] = useState(filters.q ?? "");
  const [fScope, setFScope] = useState(filters.scope ?? "all");
  const [fSegment, setFSegment] = useState(filters.segment ?? "all");
  const [fStatus, setFStatus] = useState(filters.status ?? "all");

  // create modal state
  const [cCode, setCCode] = useState("");
  const [cName, setCName] = useState("");
  const [cDesc, setCDesc] = useState("");
  const [cTable, setCTable] = useState("");
  const [cValueCol, setCValueCol] = useState("id");
  const [cSegmentType, setCSegmentType] = useState<"native" | "custom" | "">("custom");
  const [cScript, setCScript] = useState("");

  // edit modal state
  const [editing, setEditing] = useState<DimensionRow | null>(null);
  const [eName, setEName] = useState("");
  const [eDesc, setEDesc] = useState("");
  const [eTable, setETable] = useState("");
  const [eValueCol, setEValueCol] = useState("");
  const [eSegmentType, setESegmentType] = useState<"native" | "custom" | "">("");
  const [eScript, setEScript] = useState("");

  // 反查面板 state
  const [lookupDim, setLookupDim] = useState<DimensionRow | null>(null);
  const [lookupRows, setLookupRows] = useState<CoaUsingDim[]>([]);
  const [lookupLoading, setLookupLoading] = useState(false);

  const openEdit = (r: DimensionRow) => {
    setEditing(r);
    setEName(r.dimension_name);
    setEDesc(r.description ?? "");
    setETable(r.reference_table ?? "");
    setEValueCol(r.reference_value_column ?? "");
    setESegmentType((r.netsuite_segment_type as "native" | "custom" | null) ?? "");
    setEScript(r.netsuite_segment_script_id ?? "");
  };
  const closeEdit = () => setEditing(null);
  const submitEdit = () => {
    if (!editing) return;
    startTransition(async () => {
      const res = await updateDimensionAction(editing.id, {
        dimension_name: eName.trim() || undefined,
        description: eDesc.trim() || null,
        reference_table: eTable.trim() || null,
        reference_value_column: eValueCol.trim() || null,
        netsuite_segment_type: eSegmentType || null,
        netsuite_segment_script_id: eScript.trim() || null,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已更新" });
        closeEdit();
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const openLookup = (r: DimensionRow) => {
    setLookupDim(r);
    setLookupRows([]);
    setLookupLoading(true);
    void (async () => {
      const res = await listCoaUsingDimensionAction(r.dimension_code);
      setLookupLoading(false);
      if (res.ok) setLookupRows(res.data);
      else showBanner({ ok: false, msg: res.error });
    })();
  };
  const closeLookup = () => {
    setLookupDim(null);
    setLookupRows([]);
  };

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
      router.push(qs ? `/admin/accounting/dimensions?${qs}` : "/admin/accounting/dimensions");
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

  const submitCreate = () => {
    const input: DimensionInput = {
      dimension_code: cCode,
      dimension_name: cName,
      description: cDesc || null,
      reference_table: cTable || null,
      reference_value_column: cValueCol || null,
      netsuite_segment_type: cSegmentType || null,
      netsuite_segment_script_id: cScript || null,
    };
    startTransition(async () => {
      const res = await createDimensionAction(input);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已新增維度" });
        setShowCreate(false);
        setCCode("");
        setCName("");
        setCDesc("");
        setCTable("");
        setCValueCol("id");
        setCSegmentType("custom");
        setCScript("");
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
            <select className={inputClass} value={fScope} onChange={(e) => setFScope(e.target.value)}>
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
              onClick={() => setShowCreate(true)}
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
          共 <b className="text-[#2C2C2A]">{totalCount}</b> 筆維度（系統 <b>{systemCount}</b> ・本集團{" "}
          <b>{tenantCount}</b>）
        </span>
      </div>

      {/* Table */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="text-[11px] text-[#9A9890] bg-[#F8F7F4]">
              <tr>
                <th className="text-left font-medium py-2 px-3 w-[160px]">維度代碼</th>
                <th className="text-left font-medium py-2 px-3 w-[180px]">中文名</th>
                <th className="text-left font-medium py-2 px-3">說明</th>
                <th className="text-left font-medium py-2 px-3 w-[160px]">對映表</th>
                <th className="text-left font-medium py-2 px-3 w-[110px]">取值欄位</th>
                <th className="text-left font-medium py-2 px-3 w-[140px]">NetSuite Segment</th>
                <th className="text-left font-medium py-2 px-3 w-[100px]">Script ID</th>
                <th className="text-left font-medium py-2 px-3 w-[80px]">來源</th>
                <th className="text-left font-medium py-2 px-3 w-[70px]">狀態</th>
                <th className="text-right font-medium py-2 px-3 w-[210px]">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-[#F8F7F4] hover:bg-[#FBFAF7]">
                  <td className="py-2 px-3 font-mono font-semibold text-[#1A3A5C]">
                    {r.dimension_code}
                  </td>
                  <td className="py-2 px-3">{r.dimension_name}</td>
                  <td className="py-2 px-3 text-[11.5px] text-[#5A5955]">
                    {r.description ?? "—"}
                  </td>
                  <td className="py-2 px-3 font-mono text-[11.5px] text-[#5A5955]">
                    {r.reference_table ?? "—"}
                  </td>
                  <td className="py-2 px-3 font-mono text-[11.5px] text-[#5A5955]">
                    {r.reference_value_column ?? "—"}
                  </td>
                  <td className="py-2 px-3">
                    {r.netsuite_segment_type ? (
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${
                          SEGMENT_CHIP[r.netsuite_segment_type] ?? ""
                        }`}
                      >
                        {SEGMENT_LABEL[r.netsuite_segment_type] ?? r.netsuite_segment_type}
                      </span>
                    ) : (
                      <span className="text-[#9A9890]">—</span>
                    )}
                  </td>
                  <td className="py-2 px-3 font-mono text-[11.5px] text-[#5A5955]">
                    {r.netsuite_segment_script_id ?? "—"}
                  </td>
                  <td className="py-2 px-3">
                    {r.is_system_default ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF4FB] text-[#185FA5]">
                        系統
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">
                        集團
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3">
                    {r.is_active ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF3DE] text-[#3B6D11]">
                        啟用
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#6B6A68]">
                        停用
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <div className="flex gap-1.5 justify-end whitespace-nowrap">
                      <button
                        onClick={() => openLookup(r)}
                        disabled={isPending}
                        className="h-[26px] px-2.5 rounded text-[11.5px] whitespace-nowrap bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                        title="反查：哪些科目要求此維度"
                      >
                        反查
                      </button>
                      <button
                        onClick={() => openEdit(r)}
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
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-[12px] text-[#9A9890]">
                    沒有符合條件的維度
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Create Modal */}
      {showCreate && (
        <div
          className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center"
          onClick={() => !isPending && setShowCreate(false)}
        >
          <div
            className="bg-white rounded-lg shadow-2xl p-5 w-[520px] max-w-[92vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-[14px] font-semibold mb-4">＋ 新增分析維度</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>維度代碼 *</label>
                  <input
                    className={inputClass}
                    placeholder="EX: PROJECT, FLEET"
                    value={cCode}
                    onChange={(e) => setCCode(e.target.value.toUpperCase())}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>中文名稱 *</label>
                  <input className={inputClass} value={cName} onChange={(e) => setCName(e.target.value)} />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>說明</label>
                <input className={inputClass} value={cDesc} onChange={(e) => setCDesc(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>對映表名</label>
                  <input
                    className={inputClass}
                    placeholder="例：projects"
                    value={cTable}
                    onChange={(e) => setCTable(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>取值欄位</label>
                  <input
                    className={inputClass}
                    value={cValueCol}
                    onChange={(e) => setCValueCol(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>NetSuite Segment</label>
                  <select
                    className={inputClass}
                    value={cSegmentType}
                    onChange={(e) =>
                      setCSegmentType(e.target.value as "native" | "custom" | "")
                    }
                  >
                    <option value="">無</option>
                    <option value="custom">Custom Segment</option>
                    <option value="native">Native</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>Script ID</label>
                  <input
                    className={inputClass}
                    placeholder="cseg_xxx"
                    value={cScript}
                    onChange={(e) => setCScript(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowCreate(false)}
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                onClick={submitCreate}
                disabled={isPending || !cCode || !cName}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
              >
                {isPending ? "建立中⋯" : "建立"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editing && (
        <div
          className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4"
          onClick={closeEdit}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-[600px] max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="px-5 py-3 border-b border-[#EEECE6] flex items-center gap-2">
              <span className="font-mono text-[12.5px] font-semibold text-[#1A3A5C]">
                {editing.dimension_code}
              </span>
              <h2 className="text-[14px] font-semibold text-[#2C2C2A]">{editing.dimension_name}</h2>
              <span className="ml-auto text-[11px] text-[#9A9890]">
                {editing.is_system_default ? "系統預設" : "本集團自訂"}
              </span>
            </header>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className={labelClass}>中文名稱 *</label>
                <input
                  className={`${inputClass} w-full mt-1`}
                  value={eName}
                  onChange={(e) => setEName(e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>說明</label>
                <textarea
                  rows={2}
                  className="w-full mt-1 border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] focus:outline-none"
                  value={eDesc}
                  onChange={(e) => setEDesc(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>
                    對映表名 {editing.is_system_default && <span className="text-[#9A9890]">（系統預設不可改）</span>}
                  </label>
                  <input
                    className={`${inputClass} w-full mt-1`}
                    value={eTable}
                    onChange={(e) => setETable(e.target.value)}
                    disabled={editing.is_system_default}
                  />
                </div>
                <div>
                  <label className={labelClass}>取值欄位</label>
                  <input
                    className={`${inputClass} w-full mt-1`}
                    value={eValueCol}
                    onChange={(e) => setEValueCol(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>NetSuite Segment</label>
                  <select
                    className={`${inputClass} w-full mt-1`}
                    value={eSegmentType}
                    onChange={(e) =>
                      setESegmentType(e.target.value as "native" | "custom" | "")
                    }
                  >
                    <option value="">無</option>
                    <option value="custom">Custom Segment</option>
                    <option value="native">Native</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Script ID</label>
                  <input
                    className={`${inputClass} w-full mt-1 font-mono`}
                    value={eScript}
                    onChange={(e) => setEScript(e.target.value)}
                    placeholder="cseg_xxx"
                  />
                </div>
              </div>
            </div>
            <footer className="px-5 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
              <button
                onClick={closeEdit}
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={submitEdit}
                disabled={isPending || !eName.trim()}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
              >
                {isPending ? "儲存中⋯" : "儲存變更"}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Lookup Modal — 反查哪些 CoA 要求此 dim */}
      {lookupDim && (
        <div
          className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4"
          onClick={closeLookup}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-[760px] max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="px-5 py-3 border-b border-[#EEECE6] flex items-center gap-2">
              <span className="font-mono text-[12.5px] font-semibold text-[#1A3A5C]">
                {lookupDim.dimension_code}
              </span>
              <h2 className="text-[14px] font-semibold text-[#2C2C2A]">{lookupDim.dimension_name}</h2>
              <span className="ml-auto text-[11px] text-[#9A9890]">
                共 {lookupRows.length} 個 L5 科目要求此維度
              </span>
            </header>
            <div className="px-5 py-4">
              {lookupLoading && (
                <div className="text-[12px] text-[#9A9890] py-6 text-center">查詢中⋯</div>
              )}
              {!lookupLoading && lookupRows.length === 0 && (
                <div className="text-[12px] text-[#9A9890] py-6 text-center">
                  目前沒有任何科目把 {lookupDim.dimension_code} 列為必填維度
                </div>
              )}
              {!lookupLoading && lookupRows.length > 0 && (
                <table className="w-full text-[12px]">
                  <thead className="text-[11px] text-[#9A9890] bg-[#F8F7F4]">
                    <tr>
                      <th className="text-left font-medium py-2 px-3 w-[110px]">科目代碼</th>
                      <th className="text-left font-medium py-2 px-3">名稱</th>
                      <th className="text-left font-medium py-2 px-3 w-[100px]">大類</th>
                      <th className="text-left font-medium py-2 px-3 w-[110px]">業態</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lookupRows.map((c) => (
                      <tr key={c.id} className="border-t border-[#F8F7F4] hover:bg-[#FBFAF7]">
                        <td className="py-2 px-3 font-mono">{c.account_code}</td>
                        <td className="py-2 px-3">{c.name_zh_tw}</td>
                        <td className="py-2 px-3 text-[#5A5955]">{c.l1_category}</td>
                        <td className="py-2 px-3 text-[#5A5955]">{c.dealer_category}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <footer className="px-5 py-3 border-t border-[#EEECE6] flex justify-end">
              <button
                onClick={closeLookup}
                className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                關閉
              </button>
            </footer>
          </div>
        </div>
      )}
    </main>
  );
}
