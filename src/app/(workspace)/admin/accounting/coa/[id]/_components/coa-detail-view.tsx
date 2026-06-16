"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createCoaAccountAction,
  deleteCoaAccountAction,
  setCoaActiveAction,
  updateCoaMetaAction,
  type CoaCreateInput,
  type CoaParentOption,
} from "@/lib/accounting/coa-actions";
import type { CoaRow } from "@/lib/accounting/queries";

type Banner = { ok: boolean; msg: string } | null;
type Mode = "view" | "edit" | "create";

const L1_LABEL: Record<string, string> = {
  ASSET: "資產",
  LIABILITY: "負債",
  EQUITY: "權益",
  REVENUE: "營業收入",
  COGS: "營業成本",
  EXPENSE: "營業費用",
  NON_OPERATING: "營業外",
  TAX: "所得稅",
};
const DEALER_LABEL: Record<string, string> = {
  GENERAL: "通用",
  VEHICLE_SALES: "整車銷售",
  VEHICLE_INV: "車輛庫存",
  SERVICE: "維修",
  PARTS: "零件",
  INSURANCE: "保險",
  FINANCE: "分期/融資",
};
const DEALER_CHIP: Record<string, string> = {
  GENERAL: "bg-[#EEF4FB] text-[#185FA5]",
  VEHICLE_SALES: "bg-[#FDECEA] text-[#CC0000]",
  VEHICLE_INV: "bg-[#FDF3E3] text-[#854F0B]",
  SERVICE: "bg-[#E8F5F0] text-[#0F6E56]",
  PARTS: "bg-[#EAF3DE] text-[#3B6D11]",
  INSURANCE: "bg-[#EAF4FB] text-[#185FA5]",
  FINANCE: "bg-[#F2EAFB] text-[#5E2EA0]",
};
const LEVEL_LABEL: Record<string, string> = {
  L1_CATEGORY: "L1",
  L2_SUBCATEGORY: "L2",
  L3_MOEA: "L3",
  L4_PARENT: "L4",
  L5_DETAIL: "L5",
};
const LEVEL_CHIP: Record<string, string> = {
  L1_CATEGORY: "bg-[#1A3A5C] text-white",
  L2_SUBCATEGORY: "bg-[#185FA5] text-white",
  L3_MOEA: "bg-[#EAF4FB] text-[#185FA5]",
  L4_PARENT: "bg-[#FDF3E3] text-[#854F0B]",
  L5_DETAIL: "bg-[#EAF3DE] text-[#3B6D11]",
};
const TAX_LABEL: Record<string, string> = {
  NORMAL: "一般",
  VAT_OUTPUT: "銷項稅",
  VAT_INPUT: "進項稅",
  EXEMPT: "免稅",
  WITHHOLDING: "扣繳",
  DEFERRED: "遞延",
  ZERO_RATED: "零稅率",
};

export type CoaDetailViewProps = {
  coa: CoaRow | null;
  parents: CoaParentOption[];
  initialMode: Mode;
};

export function CoaDetailView({ coa, parents, initialMode }: CoaDetailViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [banner, setBanner] = useState<Banner>(null);

  // Editable metadata state（updateCoaMetaAction 接受的子集）
  const [eDesc, setEDesc] = useState(coa?.description ?? "");
  const [eReqDim, setEReqDim] = useState(
    (coa?.required_dimensions ?? []).join(", "),
  );
  const [eNsId, setENsId] = useState(coa?.netsuite_account_internal_id ?? "");
  const [eNsNo, setENsNo] = useState(coa?.netsuite_account_number ?? "");

  // Create form state
  const [cParentId, setCParentId] = useState("");
  const [cParentSearch, setCParentSearch] = useState("");
  const [cCode, setCCode] = useState("");
  const [cNameZh, setCNameZh] = useState("");
  const [cNameEn, setCNameEn] = useState("");
  // normal_balance 一律沿用 parent（借/貸不再讓 user 在 UI 設定，僅供報表用）
  const [cDealer, setCDealer] = useState<string>("");
  const [cReqDim, setCReqDim] = useState("SUBSIDIARY, STORE");
  const [cDesc, setCDesc] = useState("");

  const enterEditMode = () => {
    if (coa) {
      setEDesc(coa.description ?? "");
      setEReqDim((coa.required_dimensions ?? []).join(", "));
      setENsId(coa.netsuite_account_internal_id ?? "");
      setENsNo(coa.netsuite_account_number ?? "");
    }
    setMode("edit");
  };

  const filteredParents = useMemo(() => {
    const t = cParentSearch.trim().toLowerCase();
    if (!t) return parents.slice(0, 50);
    return parents
      .filter(
        (p) =>
          p.account_code.toLowerCase().includes(t) ||
          p.name_zh_tw.toLowerCase().includes(t),
      )
      .slice(0, 50);
  }, [parents, cParentSearch]);

  const selectedParent = useMemo(
    () => parents.find((p) => p.id === cParentId) ?? null,
    [cParentId, parents],
  );

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const submitEdit = () => {
    if (!coa) return;
    const dims = eReqDim
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    startTransition(async () => {
      const res = await updateCoaMetaAction(coa.id, {
        description: eDesc.trim() || null,
        required_dimensions: dims,
        netsuite_account_internal_id: eNsId.trim() || null,
        netsuite_account_number: eNsNo.trim() || null,
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
    if (!cParentId) {
      showBanner({ ok: false, msg: "請先選 parent (L4)" });
      return;
    }
    if (!/^\d{7}$/.test(cCode.trim())) {
      showBanner({ ok: false, msg: "L5 代碼需為 7 位數字" });
      return;
    }
    if (!cNameZh.trim()) {
      showBanner({ ok: false, msg: "中文名稱必填" });
      return;
    }
    const dims = cReqDim
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    const input: CoaCreateInput = {
      parent_id: cParentId,
      account_code: cCode.trim(),
      name_zh_tw: cNameZh.trim(),
      name_en: cNameEn.trim() || null,
      normal_balance: undefined, // 沿用 parent
      dealer_category: (cDealer || undefined) as CoaCreateInput["dealer_category"],
      required_dimensions: dims,
      description: cDesc.trim() || null,
    };
    startTransition(async () => {
      const res = await createCoaAccountAction(input);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已新增 ${res.data.account_code}` });
        router.push(`/admin/accounting/coa/${res.data.id}`);
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const removeRow = () => {
    if (!coa) return;
    if (
      !confirm(
        `確定刪除「${coa.account_code} ${coa.name_zh_tw}」？此動作無法復原。`,
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteCoaAccountAction(coa.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        router.push("/admin/accounting/coa");
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const toggleActive = () => {
    if (!coa) return;
    startTransition(async () => {
      const res = await setCoaActiveAction(coa.id, !coa.is_active);
      if (res.ok) {
        showBanner({ ok: true, msg: coa.is_active ? "✓ 已停用" : "✓ 已啟用" });
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
    mode === "create" ? "新增 L5 科目" : coa?.account_code ?? "—";

  // CRUD pills 依 mode 切換
  const renderPills = () => {
    if (mode === "edit" && coa) {
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
            onClick={() => router.push("/admin/accounting/coa")}
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
          href="/admin/accounting/coa"
          className="h-[30px] inline-flex items-center px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
        >
          返回列表
        </Link>
        <Link
          href="/admin/accounting/coa/new"
          className="h-[30px] inline-flex items-center px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm"
        >
          新增
        </Link>
        <button
          type="button"
          onClick={enterEditMode}
          disabled={isPending || !coa}
          className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
        >
          修改
        </button>
        <button
          type="button"
          onClick={removeRow}
          disabled={
            isPending || !coa || coa.is_locked || coa.is_system_default
          }
          className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
        >
          刪除
        </button>
        <button
          type="button"
          onClick={toggleActive}
          disabled={isPending || !coa || coa.is_locked}
          className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
        >
          {coa?.is_active ? "停用" : "啟用"}
        </button>
      </>
    );
  };

  return (
    <main className={`px-6 py-5 space-y-3 ${lockedClass}`}>
      {/* 1. Breadcrumb + CRUD Pill Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/admin/accounting/coa" className="hover:text-[#185FA5]">
            會計科目表
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
            L5 入帳科目
          </div>
          <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight mt-1">
            (未命名 L5 科目)
          </h1>
          <div className="mt-1 flex items-center gap-1.5 text-[12px]">
            <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">
              尚未建立
            </span>
            <span className="text-[#9A9890]">
              建立新的 L5 入帳科目（必須在 L4 parent 之下，代碼為 7 位數字）
            </span>
          </div>
        </header>
      ) : coa ? (
        <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
          <div className="flex flex-col gap-2">
            <div className="text-[11px] tracking-wider text-[#9A9890]">
              {LEVEL_LABEL[coa.level]} 科目 · {L1_LABEL[coa.l1_category]}
            </div>
            <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
              {coa.name_zh_tw}
            </h1>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
              <span className="font-mono text-[#5A5955]">{coa.account_code}</span>
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${
                  LEVEL_CHIP[coa.level] ?? ""
                }`}
              >
                {LEVEL_LABEL[coa.level] ?? coa.level}
              </span>
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${
                  DEALER_CHIP[coa.dealer_category] ?? ""
                }`}
              >
                {DEALER_LABEL[coa.dealer_category] ?? coa.dealer_category}
              </span>
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${
                  coa.is_active
                    ? "bg-[#EAF3DE] text-[#3B6D11]"
                    : "bg-[#F2F2F2] text-[#6B6A68]"
                }`}
              >
                {coa.is_active ? "啟用" : "停用"}
              </span>
              {coa.is_locked && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#FDECEA] text-[#CC0000]">
                  🔒 鎖定
                </span>
              )}
              {coa.is_system_default && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#EAF4FB] text-[#185FA5]">
                  系統預設
                </span>
              )}
              {coa.is_postable ? (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#EAF3DE] text-[#3B6D11]">
                  ✓ 可入帳
                </span>
              ) : (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#F2F2F2] text-[#6B6A68]">
                  rollup
                </span>
              )}
            </div>
          </div>
        </header>
      ) : (
        <header className="bg-white border border-[#EEECE6] rounded-lg p-6 text-center text-[13px] text-[#CC0000]">
          找不到此科目（id 不存在或已被刪除）
        </header>
      )}

      {/* 4. Sections */}
      {mode === "create" ? (
        <>
          <SectionCard title="▼ Parent 與基本資料">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              <div className="flex flex-col gap-1 md:col-span-3">
                <label className={labelClass}>Parent (L4) *</label>
                <input
                  className={inputClass}
                  placeholder="搜尋 parent code 或名稱"
                  value={cParentSearch}
                  onChange={(e) => setCParentSearch(e.target.value)}
                />
                {selectedParent ? (
                  <div className="mt-1 px-2 py-1.5 rounded border border-[#185FA5] bg-[#EAF4FB] text-[12px] text-[#185FA5] flex items-center gap-2">
                    <span className="font-mono font-semibold">
                      {selectedParent.account_code}
                    </span>
                    <span>{selectedParent.name_zh_tw}</span>
                    <span className="text-[11px] text-[#5A5955]">
                      ({L1_LABEL[selectedParent.l1_category]} ·{" "}
                      {DEALER_LABEL[selectedParent.dealer_category]})
                    </span>
                    <button
                      type="button"
                      onClick={() => setCParentId("")}
                      className="ml-auto text-[11px] text-[#185FA5] hover:underline"
                    >
                      取消選取
                    </button>
                  </div>
                ) : (
                  <div className="mt-1 max-h-[180px] overflow-y-auto border border-[#EEECE6] rounded">
                    {filteredParents.length === 0 ? (
                      <div className="px-3 py-2 text-[12px] text-[#9A9890]">
                        沒有符合的 parent
                      </div>
                    ) : (
                      filteredParents.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setCParentId(p.id);
                            const code5 = p.account_code.slice(0, 5);
                            if (cCode.length < 5) setCCode(code5);
                          }}
                          className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-[#F8F7F4] border-b border-[#F8F7F4] last:border-b-0"
                        >
                          <span className="font-mono font-semibold text-[#1A3A5C]">
                            {p.account_code}
                          </span>{" "}
                          <span className="text-[#2C2C2A]">{p.name_zh_tw}</span>{" "}
                          <span className="text-[11px] text-[#9A9890]">
                            · {DEALER_LABEL[p.dealer_category]}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>L5 代碼（7 位）*</label>
                <input
                  className={`${inputClass} font-mono`}
                  placeholder="例：1101104"
                  value={cCode}
                  onChange={(e) =>
                    setCCode(e.target.value.replace(/\D/g, "").slice(0, 7))
                  }
                  maxLength={7}
                />
                {selectedParent && (
                  <div className="text-[10px] text-[#9A9890]">
                    必以 {selectedParent.account_code} 開頭
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>中文名稱 *</label>
                <input
                  className={inputClass}
                  value={cNameZh}
                  onChange={(e) => setCNameZh(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>英文名稱</label>
                <input
                  className={inputClass}
                  value={cNameEn}
                  onChange={(e) => setCNameEn(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>業態（沿用 parent）</label>
                <select
                  className={inputClass}
                  value={cDealer}
                  onChange={(e) => setCDealer(e.target.value)}
                >
                  <option value="">沿用 parent</option>
                  {Object.entries(DEALER_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1 md:col-span-2">
                <label className={labelClass}>必填維度（逗號分隔）</label>
                <input
                  className={`${inputClass} font-mono`}
                  value={cReqDim}
                  onChange={(e) => setCReqDim(e.target.value)}
                  placeholder="SUBSIDIARY, STORE"
                />
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
            </div>
          </SectionCard>

          <div className="text-[12px] text-[#9A9890] px-1 py-2">
            建立後將跳轉到該科目的詳情頁，可進一步維護 NetSuite 對映等資料⋯
          </div>
        </>
      ) : coa ? (
        <>
          <SectionCard title="▼ 基本資料">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              <Kv label="代碼" value={<span className="font-mono">{coa.account_code}</span>} />
              <Kv label="層級" value={`${LEVEL_LABEL[coa.level]} (depth ${coa.depth})`} />
              <Kv
                label="可入帳"
                value={
                  coa.is_postable ? (
                    <span className="text-[#3B6D11]">✓ 可入帳</span>
                  ) : (
                    <span className="text-[#9A9890]">rollup（不可入帳）</span>
                  )
                }
              />
              <Kv label="中文名稱" value={coa.name_zh_tw} />
              <Kv label="英文名稱" value={coa.name_en ?? "—"} small />
              <Kv label="display_indent_name" value={coa.display_indent_name ?? "—"} small mono />
              <Kv
                label="說明"
                value={
                  mode === "edit" ? (
                    <textarea
                      className={`${taClass} w-full`}
                      rows={2}
                      value={eDesc}
                      onChange={(e) => setEDesc(e.target.value)}
                    />
                  ) : (
                    coa.description ?? "—"
                  )
                }
                full
              />
            </div>
          </SectionCard>

          <SectionCard title="▼ 階層結構">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              <Kv label="parent_code" value={coa.parent_code ?? "—"} mono small />
              <Kv label="L1 code" value={coa.l1_code} mono small />
              <Kv label="L2 code" value={coa.l2_code} mono small />
              <Kv label="L3 code" value={coa.l3_code ?? "—"} mono small />
              <Kv label="L4 code" value={coa.l4_code ?? "—"} mono small />
              <Kv label="L5 code" value={coa.l5_code ?? "—"} mono small />
              <Kv
                label="MOEA 對映"
                value={coa.moea_code ? `${coa.moea_code} ${coa.moea_name_zh ?? ""}` : "—"}
                mono
                small
              />
            </div>
          </SectionCard>

          <SectionCard title="▼ 帳務 / 業態 / 必填維度">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              <Kv label="大類 (L1)" value={`${L1_LABEL[coa.l1_category] ?? coa.l1_category} (${coa.l1_category})`} />
              <Kv label="業態" value={`${DEALER_LABEL[coa.dealer_category] ?? coa.dealer_category} (${coa.dealer_category})`} />
              <Kv label="稅務處理" value={`${TAX_LABEL[coa.tax_treatment] ?? coa.tax_treatment} (${coa.tax_treatment})`} />
              <Kv label="鎖定" value={coa.is_locked ? "是 (L1-L3 結構鎖定)" : "否"} small />
              <Kv label="系統預設" value={coa.is_system_default ? "是" : "否"} small />
              <Kv
                label="必填維度（編輯後會立即影響分錄驗證）"
                full
                value={
                  mode === "edit" ? (
                    <input
                      className={`${inputClass} font-mono w-full`}
                      value={eReqDim}
                      onChange={(e) => setEReqDim(e.target.value)}
                      placeholder="SUBSIDIARY, STORE"
                    />
                  ) : coa.required_dimensions && coa.required_dimensions.length > 0 ? (
                    <span className="font-mono">{coa.required_dimensions.join(", ")}</span>
                  ) : (
                    "—"
                  )
                }
              />
            </div>
          </SectionCard>

          <SectionCard title="▼ NetSuite 對映">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              <Kv
                label="Internal ID"
                value={
                  mode === "edit" ? (
                    <input
                      className={`${inputClass} font-mono w-full`}
                      value={eNsId}
                      onChange={(e) => setENsId(e.target.value)}
                      placeholder="例：12345"
                    />
                  ) : (
                    <span className="font-mono">{coa.netsuite_account_internal_id ?? "—"}</span>
                  )
                }
              />
              <Kv
                label="Account Number"
                value={
                  mode === "edit" ? (
                    <input
                      className={`${inputClass} font-mono w-full`}
                      value={eNsNo}
                      onChange={(e) => setENsNo(e.target.value)}
                      placeholder="例：1101104"
                    />
                  ) : (
                    <span className="font-mono">{coa.netsuite_account_number ?? "—"}</span>
                  )
                }
              />
              <Kv label="Sync Status" value={coa.netsuite_sync_status ?? "—"} small />
            </div>
          </SectionCard>

          <SectionCard title="▼ AI Tags / Benchmark（唯讀）">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              <Kv label="Benchmark Enabled" value={coa.benchmark_enabled ? "是" : "否"} small />
              <Kv label="display_order" value={String(coa.display_order)} mono small />
              <Kv
                label="ai_tags (jsonb)"
                full
                value={
                  Object.keys(coa.ai_tags ?? {}).length > 0 ? (
                    <pre className="font-mono text-[11.5px] text-[#5A5955] whitespace-pre-wrap break-all bg-[#F8F7F4] rounded px-2 py-1.5">
                      {JSON.stringify(coa.ai_tags, null, 2)}
                    </pre>
                  ) : (
                    <span className="text-[#9A9890]">{"{}"} (空)</span>
                  )
                }
              />
            </div>
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
