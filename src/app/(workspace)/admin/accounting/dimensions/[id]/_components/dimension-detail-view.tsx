"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createDimensionAction,
  deleteDimensionAction,
  listCoaUsingDimensionAction,
  setDimensionActiveAction,
  updateDimensionAction,
  type CoaUsingDim,
  type DimensionInput,
} from "@/lib/accounting/dimension-actions";
import type { DimensionRow } from "@/lib/accounting/queries";

type Banner = { ok: boolean; msg: string } | null;
type Mode = "view" | "edit" | "create";

const SEGMENT_LABEL: Record<string, string> = {
  native: "Native",
  custom: "Custom Segment",
};
const SEGMENT_CHIP: Record<string, string> = {
  native: "bg-[#EAF4FB] text-[#185FA5]",
  custom: "bg-[#F2EAFB] text-[#5E2EA0]",
};

export type DimensionDetailViewProps = {
  dim: DimensionRow | null;
  initialMode: Mode;
};

export function DimensionDetailView({ dim, initialMode }: DimensionDetailViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [banner, setBanner] = useState<Banner>(null);

  // Edit form state（updateDimensionAction 接受的欄位）
  const [eName, setEName] = useState(dim?.dimension_name ?? "");
  const [eDesc, setEDesc] = useState(dim?.description ?? "");
  const [eTable, setETable] = useState(dim?.reference_table ?? "");
  const [eValueCol, setEValueCol] = useState(dim?.reference_value_column ?? "");
  const [eRequired, setERequired] = useState<boolean>(
    dim?.is_required_globally ?? false,
  );
  const [eSegmentType, setESegmentType] = useState<"native" | "custom" | "">(
    (dim?.netsuite_segment_type as "native" | "custom" | null) ?? "",
  );
  const [eScript, setEScript] = useState(dim?.netsuite_segment_script_id ?? "");

  // Create form state
  const [cCode, setCCode] = useState("");
  const [cName, setCName] = useState("");
  const [cDesc, setCDesc] = useState("");
  const [cTable, setCTable] = useState("");
  const [cValueCol, setCValueCol] = useState("id");
  const [cRequired, setCRequired] = useState(false);
  const [cSegmentType, setCSegmentType] = useState<"native" | "custom" | "">("custom");
  const [cScript, setCScript] = useState("");

  // 反查（這個 dim 被哪些 CoA 列為必填）— 進 view mode 後一次性載入
  const [usingCoa, setUsingCoa] = useState<CoaUsingDim[]>([]);
  const [usingLoading, setUsingLoading] = useState(false);
  const usingLoadedRef = useRef(false);
  useEffect(() => {
    if (mode !== "view" || !dim || usingLoadedRef.current) return;
    usingLoadedRef.current = true;
    let cancelled = false;
    void (async () => {
      setUsingLoading(true);
      const res = await listCoaUsingDimensionAction(dim.dimension_code);
      if (cancelled) return;
      setUsingLoading(false);
      if (res.ok) setUsingCoa(res.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, dim]);

  const enterEditMode = () => {
    if (dim) {
      setEName(dim.dimension_name);
      setEDesc(dim.description ?? "");
      setETable(dim.reference_table ?? "");
      setEValueCol(dim.reference_value_column ?? "");
      setERequired(dim.is_required_globally);
      setESegmentType(
        (dim.netsuite_segment_type as "native" | "custom" | null) ?? "",
      );
      setEScript(dim.netsuite_segment_script_id ?? "");
    }
    setMode("edit");
  };

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const submitEdit = () => {
    if (!dim) return;
    if (!eName.trim()) {
      showBanner({ ok: false, msg: "中文名稱必填" });
      return;
    }
    startTransition(async () => {
      const res = await updateDimensionAction(dim.id, {
        dimension_name: eName.trim(),
        description: eDesc.trim() || null,
        reference_table: eTable.trim() || null,
        reference_value_column: eValueCol.trim() || null,
        is_required_globally: eRequired,
        netsuite_segment_type: eSegmentType || null,
        netsuite_segment_script_id: eScript.trim() || null,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存" });
        setMode("view");
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const submitCreate = () => {
    if (!cCode.trim()) {
      showBanner({ ok: false, msg: "維度代碼必填" });
      return;
    }
    if (!cName.trim()) {
      showBanner({ ok: false, msg: "中文名稱必填" });
      return;
    }
    const input: DimensionInput = {
      dimension_code: cCode.trim().toUpperCase(),
      dimension_name: cName.trim(),
      description: cDesc.trim() || null,
      reference_table: cTable.trim() || null,
      reference_value_column: cValueCol.trim() || null,
      is_required_globally: cRequired,
      netsuite_segment_type: cSegmentType || null,
      netsuite_segment_script_id: cScript.trim() || null,
    };
    startTransition(async () => {
      const res = await createDimensionAction(input);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已新增 ${input.dimension_code}` });
        router.push(`/admin/accounting/dimensions/${res.data.id}`);
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const removeRow = () => {
    if (!dim) return;
    if (!confirm(`刪除維度「${dim.dimension_code} ${dim.dimension_name}」？此動作無法復原。`)) return;
    startTransition(async () => {
      const res = await deleteDimensionAction(dim.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        router.push("/admin/accounting/dimensions");
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const toggleActive = () => {
    if (!dim) return;
    startTransition(async () => {
      const res = await setDimensionActiveAction(dim.id, !dim.is_active);
      if (res.ok) {
        showBanner({ ok: true, msg: dim.is_active ? "✓ 已停用" : "✓ 已啟用" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none";
  const taClass =
    "border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] focus:outline-none";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";
  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  const breadcrumbCode =
    mode === "create" ? "新增維度" : dim?.dimension_code ?? "—";

  const renderPills = () => {
    if (mode === "edit" && dim) {
      return (
        <>
          <button
            type="button"
            onClick={() => setMode("view")}
            disabled={isPending}
            className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submitEdit}
            disabled={isPending}
            className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
          >
            {isPending ? "儲存中⋯" : "儲存變更"}
          </button>
        </>
      );
    }
    if (mode === "create") {
      return (
        <>
          <button
            type="button"
            onClick={() => router.push("/admin/accounting/dimensions")}
            disabled={isPending}
            className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submitCreate}
            disabled={isPending}
            className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
          >
            {isPending ? "建立中⋯" : "建立並開啟"}
          </button>
        </>
      );
    }
    return (
      <>
        <Link
          href="/admin/accounting/dimensions"
          className="h-[30px] inline-flex items-center px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
        >
          返回列表
        </Link>
        <Link
          href="/admin/accounting/dimensions/new"
          className="h-[30px] inline-flex items-center px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm"
        >
          新增
        </Link>
        <button
          type="button"
          onClick={enterEditMode}
          disabled={isPending || !dim}
          className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
        >
          修改
        </button>
        <button
          type="button"
          onClick={removeRow}
          disabled={isPending || !dim || dim.is_system_default}
          className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
        >
          刪除
        </button>
        <button
          type="button"
          onClick={toggleActive}
          disabled={isPending || !dim || (dim.is_system_default && dim.is_active)}
          className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
        >
          {dim?.is_active ? "停用" : "啟用"}
        </button>
      </>
    );
  };

  return (
    <main className={`px-6 py-5 space-y-3 ${lockedClass}`}>
      {/* 1. Breadcrumb + CRUD Pill Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/admin/accounting/dimensions" className="hover:text-[#185FA5]">
            統計科目表
          </Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">{breadcrumbCode}</span>
          {mode === "edit" && (
            <span className="px-2 py-0.5 text-[11px] rounded-md bg-[#FDF3E3] text-[#854F0B]">
              編輯模式
            </span>
          )}
          {mode === "create" && (
            <span className="px-2 py-0.5 text-[11px] rounded-md bg-[#FDF3E3] text-[#854F0B]">
              建立模式
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1.5">{renderPills()}</div>
      </div>

      {/* 2. Banner */}
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

      {/* 3. Title Card */}
      {mode === "create" ? (
        <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
          <div className="text-[11px] tracking-wider text-[#9A9890]">
            GL 分析維度
          </div>
          <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight mt-1">
            （未命名維度）
          </h1>
          <div className="mt-1 flex items-center gap-1.5 text-[12px]">
            <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">
              尚未建立
            </span>
            <span className="text-[#9A9890]">
              新增 GL 分析維度（代碼為大寫英數+底線、開頭必為英文字母）
            </span>
          </div>
        </header>
      ) : dim ? (
        <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
          <div className="flex flex-col gap-2">
            <div className="text-[11px] tracking-wider text-[#9A9890]">
              GL 分析維度
            </div>
            <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
              {dim.dimension_name}
            </h1>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
              <span className="font-mono text-[#5A5955]">{dim.dimension_code}</span>
              {dim.netsuite_segment_type && (
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${
                    SEGMENT_CHIP[dim.netsuite_segment_type] ?? ""
                  }`}
                >
                  {SEGMENT_LABEL[dim.netsuite_segment_type] ??
                    dim.netsuite_segment_type}
                </span>
              )}
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${
                  dim.is_active
                    ? "bg-[#EAF3DE] text-[#3B6D11]"
                    : "bg-[#F2F2F2] text-[#6B6A68]"
                }`}
              >
                {dim.is_active ? "啟用" : "停用"}
              </span>
              {dim.is_system_default ? (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#EAF4FB] text-[#185FA5]">
                  系統預設
                </span>
              ) : (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#FDF3E3] text-[#854F0B]">
                  本集團自訂
                </span>
              )}
              {dim.is_required_globally && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#FDECEA] text-[#CC0000]">
                  全域必填
                </span>
              )}
            </div>
          </div>
        </header>
      ) : (
        <header className="bg-white border border-[#EEECE6] rounded-lg p-6 text-center text-[13px] text-[#CC0000]">
          找不到此維度（id 不存在或已被刪除）
        </header>
      )}

      {/* 4. Sections */}
      {mode === "create" ? (
        <SectionCard title="▼ 基本資料">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
            <div className="flex flex-col gap-1">
              <label className={labelClass}>維度代碼 *</label>
              <input
                className={`${inputClass} font-mono`}
                placeholder="例：PROJECT, FLEET"
                value={cCode}
                onChange={(e) => setCCode(e.target.value.toUpperCase())}
              />
              <span className="text-[10px] text-[#9A9890]">
                大寫英數+底線、開頭必為英文
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>中文名稱 *</label>
              <input
                className={inputClass}
                value={cName}
                onChange={(e) => setCName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>全域必填</label>
              <label className="inline-flex items-center gap-1.5 h-[30px] text-[12.5px]">
                <input
                  type="checkbox"
                  checked={cRequired}
                  onChange={(e) => setCRequired(e.target.checked)}
                />
                所有 L5 入帳分錄都必須帶此維度
              </label>
            </div>
            <div className="flex flex-col gap-1 md:col-span-3">
              <label className={labelClass}>說明</label>
              <textarea
                className={`${taClass} w-full`}
                rows={2}
                value={cDesc}
                onChange={(e) => setCDesc(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>對映表名</label>
              <input
                className={`${inputClass} font-mono`}
                placeholder="例：projects"
                value={cTable}
                onChange={(e) => setCTable(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>取值欄位</label>
              <input
                className={`${inputClass} font-mono`}
                value={cValueCol}
                onChange={(e) => setCValueCol(e.target.value)}
              />
            </div>
            <div />
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
            <div className="flex flex-col gap-1 md:col-span-2">
              <label className={labelClass}>Script ID</label>
              <input
                className={`${inputClass} font-mono`}
                placeholder="cseg_xxx"
                value={cScript}
                onChange={(e) => setCScript(e.target.value)}
              />
            </div>
          </div>
          <div className="text-[12px] text-[#9A9890] px-1 py-2 mt-2">
            建立後將跳轉到該維度的詳情頁，可進一步維護⋯
          </div>
        </SectionCard>
      ) : dim ? (
        <>
          <SectionCard title="▼ 基本資料">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              <Kv
                label="維度代碼"
                value={<span className="font-mono">{dim.dimension_code}</span>}
              />
              <Kv
                label="中文名稱"
                value={
                  mode === "edit" ? (
                    <input
                      className={`${inputClass} w-full`}
                      value={eName}
                      onChange={(e) => setEName(e.target.value)}
                    />
                  ) : (
                    dim.dimension_name
                  )
                }
              />
              <Kv
                label="display_order"
                value={String(dim.display_order)}
                mono
                small
              />
              <Kv
                label="說明"
                full
                value={
                  mode === "edit" ? (
                    <textarea
                      className={`${taClass} w-full`}
                      rows={2}
                      value={eDesc}
                      onChange={(e) => setEDesc(e.target.value)}
                    />
                  ) : (
                    dim.description ?? "—"
                  )
                }
              />
            </div>
          </SectionCard>

          <SectionCard title="▼ 取值來源（reference）">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              <Kv
                label={
                  dim.is_system_default
                    ? "對映表名（系統預設不可改）"
                    : "對映表名"
                }
                value={
                  mode === "edit" && !dim.is_system_default ? (
                    <input
                      className={`${inputClass} font-mono w-full`}
                      placeholder="例：projects"
                      value={eTable}
                      onChange={(e) => setETable(e.target.value)}
                    />
                  ) : (
                    <span className="font-mono">
                      {dim.reference_table ?? "—"}
                    </span>
                  )
                }
              />
              <Kv
                label="取值欄位"
                value={
                  mode === "edit" ? (
                    <input
                      className={`${inputClass} font-mono w-full`}
                      value={eValueCol}
                      onChange={(e) => setEValueCol(e.target.value)}
                    />
                  ) : (
                    <span className="font-mono">
                      {dim.reference_value_column ?? "—"}
                    </span>
                  )
                }
              />
              <Kv
                label="全域必填"
                value={
                  mode === "edit" ? (
                    <label className="inline-flex items-center gap-1.5 h-[28px] text-[12.5px]">
                      <input
                        type="checkbox"
                        checked={eRequired}
                        onChange={(e) => setERequired(e.target.checked)}
                      />
                      所有 L5 入帳分錄都必須帶
                    </label>
                  ) : dim.is_required_globally ? (
                    "是（所有 L5 必填）"
                  ) : (
                    "否（依各科目 required_dimensions）"
                  )
                }
                small={mode !== "edit"}
              />
            </div>
          </SectionCard>

          <SectionCard title="▼ NetSuite Segment 對映">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              <Kv
                label="Segment 類型"
                value={
                  mode === "edit" ? (
                    <select
                      className={`${inputClass} w-full`}
                      value={eSegmentType}
                      onChange={(e) =>
                        setESegmentType(
                          e.target.value as "native" | "custom" | "",
                        )
                      }
                    >
                      <option value="">無</option>
                      <option value="custom">Custom Segment</option>
                      <option value="native">Native</option>
                    </select>
                  ) : dim.netsuite_segment_type ? (
                    SEGMENT_LABEL[dim.netsuite_segment_type] ??
                    dim.netsuite_segment_type
                  ) : (
                    "—"
                  )
                }
              />
              <Kv
                label="Script ID"
                full
                value={
                  mode === "edit" ? (
                    <input
                      className={`${inputClass} font-mono w-full`}
                      placeholder="cseg_xxx"
                      value={eScript}
                      onChange={(e) => setEScript(e.target.value)}
                    />
                  ) : (
                    <span className="font-mono">
                      {dim.netsuite_segment_script_id ?? "—"}
                    </span>
                  )
                }
              />
            </div>
          </SectionCard>

          <SectionCard title="▼ 進階（系統欄位）">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              <Kv
                label="來源"
                value={dim.is_system_default ? "系統預設" : "本集團自訂"}
                small
              />
              <Kv
                label="狀態"
                value={dim.is_active ? "啟用" : "停用"}
                small
              />
              <Kv
                label="tenant_id"
                value={dim.tenant_id}
                mono
                small
              />
            </div>
          </SectionCard>

          <SectionCard
            title={`▼ 哪些科目要求此維度（${
              usingLoading ? "查詢中⋯" : `${usingCoa.length} 筆 L5 科目`
            }）`}
          >
            {usingLoading ? (
              <div className="text-[12px] text-[#9A9890] py-3 text-center">
                查詢中⋯
              </div>
            ) : usingCoa.length === 0 ? (
              <div className="text-[12px] text-[#9A9890] py-3 text-center">
                目前沒有任何科目把 {dim.dimension_code} 列為必填維度
              </div>
            ) : (
              <table className="w-full text-[12px]">
                <thead className="text-[11px] text-[#9A9890] bg-[#F8F7F4]">
                  <tr>
                    <th className="text-left font-medium py-2 px-3 w-[110px]">
                      科目代碼
                    </th>
                    <th className="text-left font-medium py-2 px-3">名稱</th>
                    <th className="text-left font-medium py-2 px-3 w-[110px]">
                      大類
                    </th>
                    <th className="text-left font-medium py-2 px-3 w-[110px]">
                      業態
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {usingCoa.map((c) => (
                    <tr
                      key={c.id}
                      className="border-t border-[#F8F7F4] hover:bg-[#FBFAF7]"
                    >
                      <td className="py-2 px-3">
                        <Link
                          href={`/admin/accounting/coa/${c.id}`}
                          className="font-mono text-[#185FA5] hover:underline"
                        >
                          {c.account_code}
                        </Link>
                      </td>
                      <td className="py-2 px-3">{c.name_zh_tw}</td>
                      <td className="py-2 px-3 text-[#5A5955]">
                        {c.l1_category}
                      </td>
                      <td className="py-2 px-3 text-[#5A5955]">
                        {c.dealer_category}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>
        </>
      ) : null}
    </main>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
        <span className="text-[13px] font-semibold text-[#2C2C2A]">{title}</span>
      </header>
      <div className="px-4 py-4">{children}</div>
    </section>
  );
}

function Kv({
  label,
  value,
  mono,
  small,
  full,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  small?: boolean;
  full?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-0.5 ${full ? "md:col-span-3" : ""}`}>
      <label className="text-[11px] text-[#9A9890]">{label}</label>
      <div
        className={`${mono ? "font-mono" : ""} ${
          small ? "text-[11.5px] text-[#5A5955]" : "text-[12.5px] text-[#2C2C2A]"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
