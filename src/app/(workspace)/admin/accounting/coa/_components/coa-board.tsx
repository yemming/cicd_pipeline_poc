"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createCoaAccountAction,
  deleteCoaAccountAction,
  listL4ParentsAction,
  setCoaActiveAction,
  updateCoaMetaAction,
  type CoaParentOption,
} from "@/lib/accounting/coa-actions";
import type { CoaRow } from "@/lib/accounting/queries";

type Banner = { ok: boolean; msg: string } | null;

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

export type CoaFilterState = {
  q?: string;
  l1?: string;
  dealer?: string;
  level?: string;
  postable?: string;
  status?: string;
};

export function CoaBoard({
  rows,
  totalCount,
  filters,
}: {
  rows: CoaRow[];
  totalCount: number;
  filters: CoaFilterState;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const [fQ, setFQ] = useState(filters.q ?? "");
  const [fL1, setFL1] = useState(filters.l1 ?? "all");
  const [fDealer, setFDealer] = useState(filters.dealer ?? "all");
  const [fLevel, setFLevel] = useState(filters.level ?? "all");
  const [fPostable, setFPostable] = useState(filters.postable ?? "all");
  const [fStatus, setFStatus] = useState(filters.status ?? "all");

  const [editing, setEditing] = useState<CoaRow | null>(null);
  const [eDesc, setEDesc] = useState("");
  const [eReqDim, setEReqDim] = useState("");
  const [eNsId, setENsId] = useState("");
  const [eNsNo, setENsNo] = useState("");

  // Create new L5 modal state
  const [creating, setCreating] = useState(false);
  const [parents, setParents] = useState<CoaParentOption[]>([]);
  const [parentQuery, setParentQuery] = useState("");
  const [cParentId, setCParentId] = useState("");
  const [cCode, setCCode] = useState("");
  const [cNameZh, setCNameZh] = useState("");
  const [cNameEn, setCNameEn] = useState("");
  const [cNormBal, setCNormBal] = useState<"D" | "C" | "">("");
  const [cDealer, setCDealer] = useState<string>("");
  const [cReqDim, setCReqDim] = useState("SUBSIDIARY, STORE");
  const [cDesc, setCDesc] = useState("");

  // Lazy load parents on first openCreate
  useEffect(() => {
    if (creating && parents.length === 0) {
      void (async () => {
        const res = await listL4ParentsAction();
        if (res.ok) setParents(res.data);
        else setBanner({ ok: false, msg: `撈 parent 列表失敗：${res.error}` });
      })();
    }
  }, [creating, parents.length]);

  const filteredParents = useMemo(() => {
    const t = parentQuery.trim().toLowerCase();
    if (!t) return parents.slice(0, 100);
    return parents
      .filter(
        (p) =>
          p.account_code.toLowerCase().includes(t) ||
          p.name_zh_tw.toLowerCase().includes(t),
      )
      .slice(0, 100);
  }, [parents, parentQuery]);

  const selectedParent = useMemo(
    () => parents.find((p) => p.id === cParentId) ?? null,
    [cParentId, parents],
  );

  const openCreate = () => {
    setCreating(true);
    setParentQuery("");
    setCParentId("");
    setCCode("");
    setCNameZh("");
    setCNameEn("");
    setCNormBal("");
    setCDealer("");
    setCReqDim("SUBSIDIARY, STORE");
    setCDesc("");
  };
  const closeCreate = () => setCreating(false);

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
    startTransition(async () => {
      const res = await createCoaAccountAction({
        parent_id: cParentId,
        account_code: cCode.trim(),
        name_zh_tw: cNameZh.trim(),
        name_en: cNameEn.trim() || null,
        normal_balance: cNormBal || undefined,
        dealer_category: (cDealer || undefined) as
          | "GENERAL"
          | "VEHICLE_SALES"
          | "VEHICLE_INV"
          | "SERVICE"
          | "PARTS"
          | "INSURANCE"
          | "FINANCE"
          | undefined,
        required_dimensions: dims,
        description: cDesc.trim() || null,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已新增 ${res.data.account_code}` });
        closeCreate();
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const onDeleteRow = (r: CoaRow) => {
    if (r.is_locked) {
      showBanner({ ok: false, msg: "L1-L3 鎖定不可刪" });
      return;
    }
    if (r.is_system_default) {
      showBanner({ ok: false, msg: "系統預設科目不可刪除（可改用停用）" });
      return;
    }
    if (!confirm(`確定刪除「${r.account_code} ${r.name_zh_tw}」？此動作無法復原。`)) return;
    startTransition(async () => {
      const res = await deleteCoaAccountAction(r.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const openEdit = (r: CoaRow) => {
    setEditing(r);
    setEDesc(r.description ?? "");
    setEReqDim(
      Array.isArray(r.required_dimensions) ? r.required_dimensions.join(", ") : "",
    );
    setENsId(r.netsuite_account_internal_id ?? "");
    setENsNo(r.netsuite_account_number ?? "");
  };
  const closeEdit = () => setEditing(null);
  const submitEdit = () => {
    if (!editing) return;
    const dims = eReqDim
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    startTransition(async () => {
      const res = await updateCoaMetaAction(editing.id, {
        description: eDesc.trim() || null,
        required_dimensions: dims,
        netsuite_account_internal_id: eNsId.trim() || null,
        netsuite_account_number: eNsNo.trim() || null,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存" });
        closeEdit();
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const submitFilters = () => {
    const p = new URLSearchParams();
    if (fQ.trim()) p.set("q", fQ.trim());
    if (fL1 !== "all") p.set("l1", fL1);
    if (fDealer !== "all") p.set("dealer", fDealer);
    if (fLevel !== "all") p.set("level", fLevel);
    if (fPostable !== "all") p.set("postable", fPostable);
    if (fStatus !== "all") p.set("status", fStatus);
    const qs = p.toString();
    startTransition(() => {
      router.push(qs ? `/admin/accounting/coa?${qs}` : "/admin/accounting/coa");
    });
  };
  const resetFilters = () => {
    setFQ("");
    setFL1("all");
    setFDealer("all");
    setFLevel("all");
    setFPostable("all");
    setFStatus("all");
    startTransition(() => router.push("/admin/accounting/coa"));
  };

  const toggleActive = (r: CoaRow) => {
    if (r.is_locked) {
      showBanner({ ok: false, msg: "L1-L3 結構鎖定，不可停用" });
      return;
    }
    startTransition(async () => {
      const res = await setCoaActiveAction(r.id, !r.is_active);
      if (res.ok) {
        showBanner({ ok: true, msg: r.is_active ? "✓ 已停用" : "✓ 已啟用" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const grouped = useMemo(() => {
    return {
      total: totalCount,
      shown: rows.length,
      l5_postable: rows.filter((r) => r.is_postable).length,
    };
  }, [rows, totalCount]);

  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";
  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  return (
    <main className={`px-6 py-5 space-y-3 ${lockedClass}`}>
      {/* 1. Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">會計科目表</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          COA v2.0
        </span>
        <span className="text-[12px] text-[#9A9890]">
          5 層架構（MOEA 錨點）・依 template_pack「MOTORCYCLE」部署・tenant = default group
        </span>
      </header>

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

      {/* 3. Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>關鍵字</label>
            <input
              className={inputClass}
              placeholder="科目代碼 / 名稱 / MOEA"
              value={fQ}
              onChange={(e) => setFQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitFilters()}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>大類 (L1)</label>
            <select className={inputClass} value={fL1} onChange={(e) => setFL1(e.target.value)}>
              <option value="all">全部</option>
              {Object.entries(L1_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>業態</label>
            <select
              className={inputClass}
              value={fDealer}
              onChange={(e) => setFDealer(e.target.value)}
            >
              <option value="all">全部</option>
              {Object.entries(DEALER_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>層級</label>
            <select
              className={inputClass}
              value={fLevel}
              onChange={(e) => setFLevel(e.target.value)}
            >
              <option value="all">全部</option>
              {Object.entries(LEVEL_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>可入帳</label>
            <select
              className={inputClass}
              value={fPostable}
              onChange={(e) => setFPostable(e.target.value)}
            >
              <option value="all">全部</option>
              <option value="yes">是 (L5)</option>
              <option value="no">否 (L1-L4)</option>
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
              onClick={openCreate}
              disabled={isPending}
              className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
            >
              ＋ 新增 L5 科目
            </button>
          </div>
        </div>
      </section>

      {/* 4. Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{grouped.total}</b> 筆科目（顯示{" "}
          <b>{grouped.shown}</b> 筆，可入帳 <b>{grouped.l5_postable}</b> 筆 L5）
        </span>
      </div>

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4" onClick={closeEdit}>
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-[640px] max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="px-5 py-3 border-b border-[#EEECE6] flex items-center gap-2">
              <span className="font-mono text-[12.5px] text-[#5A5955]">{editing.account_code}</span>
              <h2 className="text-[14px] font-semibold text-[#2C2C2A]">{editing.name_zh_tw}</h2>
              <span className="ml-auto text-[11px] text-[#9A9890]">
                {LEVEL_LABEL[editing.level]} · {L1_LABEL[editing.l1_category]}
              </span>
            </header>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className={labelClass}>說明 (description)</label>
                <textarea
                  value={eDesc}
                  onChange={(e) => setEDesc(e.target.value)}
                  rows={3}
                  className="w-full mt-1 border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] focus:outline-none"
                  placeholder="這個科目的補充說明 / 入帳規則 / 注意事項"
                />
              </div>
              <div>
                <label className={labelClass}>必填維度（用逗號分隔，自動轉大寫）</label>
                <textarea
                  value={eReqDim}
                  onChange={(e) => setEReqDim(e.target.value)}
                  rows={2}
                  className="w-full mt-1 border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] font-mono focus:border-[#185FA5] focus:outline-none"
                  placeholder="例：SUBSIDIARY, STORE, BRAND, VEHICLE"
                />
                <p className="mt-1 text-[11px] text-[#9A9890]">
                  常用：SUBSIDIARY · STORE · BRAND · DEPT · VEHICLE · MODEL · MODEL_YEAR · SALESPERSON · TECHNICIAN · RO · CUSTOMER · VENDOR · PART_SKU · WAREHOUSE · BANK · CONTRACT · INSURER
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>NetSuite Internal ID</label>
                  <input
                    value={eNsId}
                    onChange={(e) => setENsId(e.target.value)}
                    className={`${inputClass} w-full mt-1`}
                    placeholder="例：1234"
                  />
                </div>
                <div>
                  <label className={labelClass}>NetSuite Account #</label>
                  <input
                    value={eNsNo}
                    onChange={(e) => setENsNo(e.target.value)}
                    className={`${inputClass} w-full mt-1`}
                    placeholder="例：1100-01"
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
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
              >
                {isPending ? "儲存中⋯" : "儲存變更"}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Create Modal — L5 子科目 */}
      {creating && (
        <div
          className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4"
          onClick={closeCreate}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-[680px] max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="px-5 py-3 border-b border-[#EEECE6] flex items-center gap-2">
              <h2 className="text-[14px] font-semibold text-[#2C2C2A]">＋ 新增 L5 入帳科目</h2>
              <span className="ml-auto text-[11px] text-[#9A9890]">
                只能在 L4_PARENT 下新建；L5 代碼前 5 碼必須等於 parent
              </span>
            </header>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className={labelClass}>選擇 Parent (L4) *</label>
                <input
                  className={`${inputClass} w-full mt-1`}
                  placeholder="搜尋 L4 代碼或名稱"
                  value={parentQuery}
                  onChange={(e) => setParentQuery(e.target.value)}
                />
                <select
                  className="w-full mt-1.5 border border-[#D5D3CB] rounded px-2 py-1 text-[12.5px] focus:border-[#185FA5] focus:outline-none"
                  size={5}
                  value={cParentId}
                  onChange={(e) => {
                    setCParentId(e.target.value);
                    const p = parents.find((x) => x.id === e.target.value);
                    if (p) {
                      // 自動帶入 code 前 5 碼
                      if (!cCode || cCode.length < 5)
                        setCCode(p.account_code);
                      // 自動帶入 normal_balance 跟 dealer_category
                      if (!cNormBal) setCNormBal(p.normal_balance);
                      if (!cDealer) setCDealer(p.dealer_category);
                    }
                  }}
                >
                  {filteredParents.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.account_code} {p.name_zh_tw} · {L1_LABEL[p.l1_category] ?? p.l1_category}
                      {" · "}
                      {DEALER_LABEL[p.dealer_category] ?? p.dealer_category}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-[#9A9890]">
                  {selectedParent
                    ? `已選：${selectedParent.account_code} ${selectedParent.name_zh_tw}（建議 L5 代碼：${selectedParent.account_code}xx）`
                    : `共 ${parents.length} 個 L4 parent`}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>L5 科目代碼 (7 碼) *</label>
                  <input
                    className={`${inputClass} w-full mt-1 font-mono`}
                    placeholder="1101104"
                    value={cCode}
                    onChange={(e) => setCCode(e.target.value)}
                    maxLength={7}
                  />
                </div>
                <div>
                  <label className={labelClass}>正常餘額</label>
                  <select
                    className={`${inputClass} w-full mt-1`}
                    value={cNormBal}
                    onChange={(e) => setCNormBal(e.target.value as "D" | "C" | "")}
                  >
                    <option value="">沿用 parent</option>
                    <option value="D">借 (D)</option>
                    <option value="C">貸 (C)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>中文名稱 *</label>
                  <input
                    className={`${inputClass} w-full mt-1`}
                    placeholder="例：現金－高雄分店"
                    value={cNameZh}
                    onChange={(e) => setCNameZh(e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass}>英文名稱</label>
                  <input
                    className={`${inputClass} w-full mt-1`}
                    placeholder="Cash - Kaohsiung Branch"
                    value={cNameEn}
                    onChange={(e) => setCNameEn(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>業態 (dealer_category)</label>
                <select
                  className={`${inputClass} w-full mt-1`}
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

              <div>
                <label className={labelClass}>必填維度（逗號分隔，自動轉大寫）</label>
                <textarea
                  rows={2}
                  className="w-full mt-1 border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] font-mono focus:border-[#185FA5] focus:outline-none"
                  value={cReqDim}
                  onChange={(e) => setCReqDim(e.target.value)}
                  placeholder="SUBSIDIARY, STORE"
                />
                <p className="mt-1 text-[11px] text-[#9A9890]">
                  常用：SUBSIDIARY · STORE · BRAND · DEPT · VEHICLE · MODEL · SALESPERSON · TECHNICIAN · RO · CUSTOMER · VENDOR · PART_SKU · WAREHOUSE · BANK · CONTRACT · INSURER
                </p>
              </div>

              <div>
                <label className={labelClass}>說明 (description)</label>
                <textarea
                  rows={2}
                  className="w-full mt-1 border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] focus:outline-none"
                  value={cDesc}
                  onChange={(e) => setCDesc(e.target.value)}
                  placeholder="這個科目的補充說明 / 入帳規則"
                />
              </div>
            </div>
            <footer className="px-5 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
              <button
                onClick={closeCreate}
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={submitCreate}
                disabled={isPending || !cParentId || cCode.length !== 7 || !cNameZh.trim()}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
              >
                {isPending ? "建立中⋯" : "建立 L5 科目"}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* 5. Table */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="text-[11px] text-[#9A9890] bg-[#F8F7F4] sticky top-0">
              <tr>
                <th className="text-left font-medium py-2 px-3 w-[110px]">代碼</th>
                <th className="text-left font-medium py-2 px-3 w-[60px]">層</th>
                <th className="text-left font-medium py-2 px-3">科目名稱</th>
                <th className="text-left font-medium py-2 px-3 w-[90px]">大類</th>
                <th className="text-left font-medium py-2 px-3 w-[100px]">業態</th>
                <th className="text-left font-medium py-2 px-3 w-[80px]">MOEA</th>
                <th className="text-left font-medium py-2 px-3 w-[70px]">借/貸</th>
                <th className="text-left font-medium py-2 px-3 w-[80px]">入帳</th>
                <th className="text-left font-medium py-2 px-3 w-[140px]">必填維度</th>
                <th className="text-left font-medium py-2 px-3 w-[70px]">狀態</th>
                <th className="text-right font-medium py-2 px-3 w-[110px]">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-[#F8F7F4] hover:bg-[#FBFAF7]">
                  <td className="py-2 px-3 font-mono text-[12px]">{r.account_code}</td>
                  <td className="py-2 px-3">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EBF3FF] text-[#1A3A5C]">
                      {LEVEL_LABEL[r.level]}
                    </span>
                  </td>
                  <td className="py-2 px-3">
                    <span style={{ paddingLeft: `${(r.depth - 1) * 14}px` }}>
                      {r.is_locked && <span className="mr-1 text-[#9A9890]">🔒</span>}
                      <span className={r.depth <= 3 ? "font-semibold" : ""}>{r.name_zh_tw}</span>
                      {r.description && (
                        <span className="ml-2 text-[11.5px] text-[#9A9890]">{r.description}</span>
                      )}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-[#5A5955]">{L1_LABEL[r.l1_category]}</td>
                  <td className="py-2 px-3">
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${
                        DEALER_CHIP[r.dealer_category] ?? "bg-[#F2F2F2] text-[#6B6A68]"
                      }`}
                    >
                      {DEALER_LABEL[r.dealer_category]}
                    </span>
                  </td>
                  <td className="py-2 px-3 font-mono text-[11.5px] text-[#5A5955]">
                    {r.moea_code ?? "—"}
                  </td>
                  <td className="py-2 px-3 text-center">
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${
                        r.normal_balance === "D"
                          ? "bg-[#EAF4FB] text-[#185FA5]"
                          : "bg-[#FDF3E3] text-[#854F0B]"
                      }`}
                    >
                      {r.normal_balance === "D" ? "借" : "貸"}
                    </span>
                  </td>
                  <td className="py-2 px-3">
                    {r.is_postable ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF3DE] text-[#3B6D11]">
                        ✓ 可入帳
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#6B6A68]">
                        rollup
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-[11.5px] text-[#5A5955]">
                    {Array.isArray(r.required_dimensions) && r.required_dimensions.length > 0
                      ? r.required_dimensions.join(", ")
                      : "—"}
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
                    <div className="inline-flex gap-1">
                      <button
                        onClick={() => openEdit(r)}
                        disabled={isPending}
                        className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                      >
                        編輯
                      </button>
                      <button
                        onClick={() => toggleActive(r)}
                        disabled={isPending || r.is_locked}
                        className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                        title={r.is_locked ? "L1-L3 鎖定" : ""}
                      >
                        {r.is_active ? "停用" : "啟用"}
                      </button>
                      <button
                        onClick={() => onDeleteRow(r)}
                        disabled={isPending || r.is_locked || r.is_system_default}
                        className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-40"
                        title={r.is_locked ? "L1-L3 鎖定" : r.is_system_default ? "系統預設不可刪" : ""}
                      >
                        刪除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-[12px] text-[#9A9890]">
                    沒有符合條件的科目
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
