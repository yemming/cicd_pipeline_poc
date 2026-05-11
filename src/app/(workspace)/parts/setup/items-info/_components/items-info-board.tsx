"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { ItemWithSkus, ItemSkuRow } from "@/domain/items";
import {
  addItemSkuAction,
  updateItemSkuAction,
  deleteItemSkuAction,
  setPrimaryItemSkuAction,
} from "@/lib/parts-setup/item-sku-actions";

// 注意：DB CHECK constraint 只接受 'oem' | 'internal' | 'alternate' | 'barcode' | 'supplier'
// 在 client side 重新宣告（"use server" 模組不能 re-export 非 async 值）
const ITEM_SKU_TYPES = ["oem", "internal", "alternate", "barcode", "supplier"] as const;
const SKU_TYPE_LABEL: Record<string, string> = {
  oem: "原廠料號（DMS）",
  internal: "內部料號",
  alternate: "替代料號",
  barcode: "條碼",
  supplier: "供應商料號",
};

const RECENT_QUERIES_KEY = "items-info:recent-queries:v1";
const RECENT_LIMIT = 10;

type RecentQuery = {
  q: string;
  sku_type?: string;
  matched_name?: string;
  ts: number;
};

function getMeta(skus: ItemSkuRow[], type: string): ItemSkuRow | null {
  return skus.find((s) => s.sku_type === type) ?? null;
}

type Banner = { ok: boolean; msg: string } | null;

export function ItemsInfoBoard({
  initialQ,
  initialSkuType,
  result,
  searched,
  canEdit,
}: {
  initialQ: string;
  initialSkuType: string;
  result: ItemWithSkus | null;
  searched: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [q, setQ] = useState(initialQ);
  const [skuType, setSkuType] = useState(initialSkuType);
  const [manageOpen, setManageOpen] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);
  const [recents, setRecents] = useState<RecentQuery[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // mount 後讀 localStorage（避免 SSR mismatch）
  useEffect(() => {
    let next: RecentQuery[] = [];
    try {
      const raw = localStorage.getItem(RECENT_QUERIES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          next = parsed.slice(0, RECENT_LIMIT);
        }
      }
    } catch {
      /* localStorage 壞掉就忽略 */
    }

    // 同時若 server 帶了 q/result 進來（例如直接從 URL 載入），把它 merge 進 recent
    if (searched && initialQ) {
      const entry: RecentQuery = {
        q: initialQ,
        sku_type: initialSkuType || undefined,
        matched_name: result?.name,
        ts: Date.now(),
      };
      const dedup = next.filter(
        (r) => !(r.q === entry.q && (r.sku_type ?? "") === (entry.sku_type ?? "")),
      );
      next = [entry, ...dedup].slice(0, RECENT_LIMIT);
      try {
        localStorage.setItem(RECENT_QUERIES_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    }

    setRecents(next);
    setHydrated(true);
    // 只在 mount 跑一次（後續查詢由 applyFilter 直接 push 進 localStorage + state）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pushRecent(entryQ: string, entryType: string, matchedName: string | undefined) {
    const entry: RecentQuery = {
      q: entryQ,
      sku_type: entryType || undefined,
      matched_name: matchedName,
      ts: Date.now(),
    };
    setRecents((prev) => {
      const dedup = prev.filter(
        (r) => !(r.q === entry.q && (r.sku_type ?? "") === (entry.sku_type ?? "")),
      );
      const next = [entry, ...dedup].slice(0, RECENT_LIMIT);
      try {
        localStorage.setItem(RECENT_QUERIES_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function applyFilter(overrideQ?: string, overrideType?: string) {
    const useQ = overrideQ ?? q;
    const useType = overrideType ?? skuType;
    const params = new URLSearchParams();
    if (useQ) params.set("q", useQ);
    if (useType) params.set("sku_type", useType);
    if (useQ) {
      // 點查詢時就 push 進 recent；matched_name 留 undefined，等下次載入時 (URL = q) 由 mount-time 補上
      pushRecent(useQ, useType, undefined);
    }
    startTransition(() => {
      router.push(`/parts/setup/items-info${params.toString() ? "?" + params.toString() : ""}`);
    });
  }

  function reuseRecent(r: RecentQuery) {
    setQ(r.q);
    setSkuType(r.sku_type ?? "");
    applyFilter(r.q, r.sku_type ?? "");
  }

  function showBanner(b: Banner) {
    setBanner(b);
    if (b?.ok) {
      setTimeout(() => setBanner(null), 2200);
    }
  }

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">商品資訊（多維度料號）</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          3.2
        </span>
        <span className="text-[12px] text-[#9A9890]">
          管理備件的多維度屬性：原廠料號、替代料號、條碼、規格
        </span>
      </header>

      <div className="bg-[#EAF4FB] border border-[#B5D4F4] rounded-md px-4 py-2.5 text-[12px] text-[#1A3A5C]">
        📌 每件備件可設定多個料號維度：<b>原廠料號（DMS）</b>、<b>內部料號</b>、<b>替代料號</b>、
        <b>條碼</b>、<b>供應商料號</b>，系統均可相互查詢對應。
      </div>

      <div className="flex gap-3 items-start">
        <div className="flex-1 min-w-0 space-y-3">
          {/* 搜尋 */}
          <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
            <div className="flex gap-2 items-end flex-wrap">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-[#9A9890] font-medium">查詢維度</label>
                <select
                  value={skuType}
                  onChange={(e) => setSkuType(e.target.value)}
                  className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
                >
                  <option value="">全部維度</option>
                  {ITEM_SKU_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {SKU_TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-[#9A9890] font-medium">料號 / 條碼</label>
                <input
                  type="text"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && applyFilter()}
                  placeholder="輸入任意料號格式..."
                  className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-[240px]"
                />
              </div>
              <button
                type="button"
                onClick={() => applyFilter()}
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
              >
                {isPending ? "查詢中⋯" : "查詢"}
              </button>
            </div>
          </section>

          {/* 詳情卡 */}
          {searched && !result && (
            <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-10 text-center text-[12px] text-[#9A9890]">
              查無料號 <b>{initialQ}</b>，請確認輸入正確或換一個維度查詢
            </div>
          )}
          {result && (
            <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
              <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
                <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
                  {result.name} — 料號詳情
                </h2>
                <button
                  type="button"
                  disabled={!canEdit}
                  title={canEdit ? "管理 SKU 多維度料號" : "沒有權限"}
                  onClick={() => setManageOpen(true)}
                  className="h-[26px] px-3 rounded text-[11.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  管理 SKU
                </button>
              </header>
              <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Kv label={SKU_TYPE_LABEL.oem} mono value={getMeta(result.skus, "oem")?.sku_code ?? "—"} />
                  <Kv label={SKU_TYPE_LABEL.internal} mono value={getMeta(result.skus, "internal")?.sku_code ?? result.code ?? "—"} />
                  {result.skus
                    .filter((s) => s.sku_type === "alternate")
                    .map((s, idx) => (
                      <div key={s.id}>
                        <div className="text-[11px] text-[#9A9890] mb-0.5">
                          替代料號 {idx + 1}
                          {s.notes && (
                            <span className="ml-1 text-[#854F0B]">⚠ {s.notes}</span>
                          )}
                        </div>
                        <div className="font-mono text-[13px] text-[#2C2C2A]">
                          {s.sku_code}
                        </div>
                      </div>
                    ))}
                  {result.skus
                    .filter((s) => s.sku_type === "supplier")
                    .map((s, idx) => (
                      <div key={s.id}>
                        <div className="text-[11px] text-[#9A9890] mb-0.5">
                          供應商料號 {idx + 1}
                          {s.notes && (
                            <span className="ml-1 text-[#854F0B]">⚠ {s.notes}</span>
                          )}
                        </div>
                        <div className="font-mono text-[13px] text-[#2C2C2A]">
                          {s.sku_code}
                        </div>
                      </div>
                    ))}
                </div>
                <div className="flex flex-col gap-2">
                  <Kv label={SKU_TYPE_LABEL.barcode} mono value={getMeta(result.skus, "barcode")?.sku_code ?? "—"} />
                  <Kv label="規格描述" value={result.spec_description ?? "—"} />
                  <Kv label="基本單位 (UoM)" value={result.base_uom ?? "—"} />
                  <Kv label="重量" value={result.weight_kg ? `${result.weight_kg} kg` : "—"} mono />
                </div>
              </div>
              <div className="px-4 py-2 border-t border-[#EEECE6] bg-white text-[11px] text-[#9A9890]">
                💡 多維度查詢：原廠料號 / 內部料號 / 替代料號 / 條碼 / 供應商料號任一輸入皆可定位到此商品
              </div>
            </section>
          )}
          {!searched && !result && (
            <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-10 text-center text-[12px] text-[#9A9890]">
              請輸入料號或條碼開始查詢
            </div>
          )}
        </div>

        {/* 右欄：最近查詢紀錄（localStorage、上限 10 筆） */}
        <aside className="w-[220px] flex-shrink-0">
          <div className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-[#F8F7F4] border-b border-[#EEECE6] text-[12px] font-semibold text-[#5A5955] flex items-center justify-between">
              <span>最近查詢紀錄</span>
              {recents.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setRecents([]);
                    try {
                      localStorage.removeItem(RECENT_QUERIES_KEY);
                    } catch {
                      /* ignore */
                    }
                  }}
                  className="text-[10.5px] text-[#9A9890] hover:text-[#CC0000]"
                >
                  清空
                </button>
              )}
            </div>
            {!hydrated || recents.length === 0 ? (
              <div className="px-3 py-6 text-[11px] text-[#9A9890] text-center">
                {hydrated ? "尚無查詢紀錄" : "（讀取中⋯）"}
              </div>
            ) : (
              <ul className="divide-y divide-[#EEECE6]">
                {recents.map((rRaw, i) => {
                  // 若這筆 recent 對應目前 URL 上的查詢、用 result.name 補上 matched_name
                  const isCurrent =
                    rRaw.q === initialQ && (rRaw.sku_type ?? "") === (initialSkuType ?? "");
                  const r =
                    isCurrent && !rRaw.matched_name && result?.name
                      ? { ...rRaw, matched_name: result.name }
                      : rRaw;
                  return (
                  <li key={`${r.ts}-${i}`}>
                    <button
                      type="button"
                      onClick={() => reuseRecent(r)}
                      className="w-full text-left px-3 py-2 hover:bg-[#F8F7F4] disabled:opacity-50"
                      disabled={isPending}
                      title={`${r.q}${r.sku_type ? ` (${r.sku_type})` : ""}`}
                    >
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="font-mono text-[12px] text-[#1A3A5C] truncate">
                          {r.q}
                        </span>
                        {r.sku_type && (
                          <span className="px-1 py-0.5 rounded-md text-[10px] bg-[#EAF4FB] text-[#185FA5]">
                            {SKU_TYPE_LABEL[r.sku_type] ?? r.sku_type}
                          </span>
                        )}
                      </div>
                      {r.matched_name ? (
                        <div className="text-[11px] text-[#5A5955] truncate mt-0.5">
                          {r.matched_name}
                        </div>
                      ) : (
                        <div className="text-[11px] text-[#9A9890] mt-0.5">（點擊重查）</div>
                      )}
                    </button>
                  </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>
      </div>

      {manageOpen && result && (
        <ManageSkuModal
          item={result}
          canEdit={canEdit}
          onClose={() => setManageOpen(false)}
          onChanged={() => {
            startTransition(() => {
              router.refresh();
            });
          }}
          showBanner={showBanner}
        />
      )}

      {banner && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-[60] ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      )}
    </main>
  );
}

function ManageSkuModal({
  item,
  canEdit,
  onClose,
  onChanged,
  showBanner,
}: {
  item: ItemWithSkus;
  canEdit: boolean;
  onClose: () => void;
  onChanged: () => void;
  showBanner: (b: Banner) => void;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newType, setNewType] = useState<string>("alternate");
  const [newCode, setNewCode] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { sku_code: string; notes: string }>>(() => {
    const m: Record<string, { sku_code: string; notes: string }> = {};
    for (const s of item.skus) {
      m[s.id] = { sku_code: s.sku_code, notes: s.notes ?? "" };
    }
    return m;
  });

  const inputClass =
    "h-[28px] border border-[#D5D3CB] rounded px-2 text-[12px] focus:border-[#185FA5] outline-none";
  const btnSecondary =
    "h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50";
  const btnDanger =
    "h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50";
  const btnPrimary =
    "h-[28px] px-3 rounded text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50";

  async function handleSave(skuId: string) {
    if (!canEdit) return;
    const d = drafts[skuId];
    const orig = item.skus.find((s) => s.id === skuId);
    if (!orig) return;
    if (d.sku_code === orig.sku_code && (d.notes || "") === (orig.notes ?? "")) return;
    setPendingId(skuId);
    const res = await updateItemSkuAction(skuId, {
      sku_code: d.sku_code,
      notes: d.notes,
    });
    setPendingId(null);
    if (res.ok) {
      showBanner({ ok: true, msg: "✓ 已更新料號" });
      onChanged();
    } else {
      showBanner({ ok: false, msg: res.error });
    }
  }

  async function handleDelete(skuId: string) {
    if (!canEdit) return;
    if (!confirm("確定刪除這筆料號？")) return;
    setPendingId(skuId);
    const res = await deleteItemSkuAction(skuId);
    setPendingId(null);
    if (res.ok) {
      showBanner({ ok: true, msg: "✓ 已刪除料號" });
      onChanged();
    } else {
      showBanner({ ok: false, msg: res.error });
    }
  }

  async function handleSetPrimary(skuId: string) {
    if (!canEdit) return;
    setPendingId(skuId);
    const res = await setPrimaryItemSkuAction(item.id, skuId);
    setPendingId(null);
    if (res.ok) {
      showBanner({ ok: true, msg: "✓ 已設為主要" });
      onChanged();
    } else {
      showBanner({ ok: false, msg: res.error });
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    if (!newCode.trim()) {
      showBanner({ ok: false, msg: "料號 / 條碼必填" });
      return;
    }
    setIsAdding(true);
    const res = await addItemSkuAction(item.id, {
      sku_type: newType,
      sku_code: newCode,
      notes: newNotes,
    });
    setIsAdding(false);
    if (res.ok) {
      showBanner({ ok: true, msg: "✓ 已新增料號" });
      setNewCode("");
      setNewNotes("");
      onChanged();
    } else {
      showBanner({ ok: false, msg: res.error });
    }
  }

  const busy = pendingId !== null || isAdding;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-[#EEECE6] flex items-center">
          <h2 className="text-[14px] font-semibold text-[#2C2C2A]">
            管理料號 — {item.name}
          </h2>
          <span className="ml-2 px-1.5 py-0.5 text-[11px] rounded-md bg-[#FDF3E3] text-[#854F0B]">
            僅可編輯料號維度，主檔欄位本 Phase 鎖定
          </span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto w-7 h-7 rounded hover:bg-[#F8F7F4] text-[#9A9890] text-[18px] leading-none"
          >
            ×
          </button>
        </div>

        <div className={`px-5 py-4 ${busy ? "pointer-events-none opacity-60" : ""}`}>
          {/* 既有 SKU 表 */}
          <div className="mb-4">
            <div className="text-[12px] font-semibold text-[#5A5955] mb-2">
              既有料號（共 {item.skus.length} 筆）
            </div>
            {item.skus.length === 0 ? (
              <div className="border border-dashed border-[#D5D3CB] rounded px-4 py-6 text-center text-[12px] text-[#9A9890]">
                尚無料號，請從下方新增
              </div>
            ) : (
              <div className="border border-[#EEECE6] rounded overflow-hidden">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="bg-[#F8F7F4] text-[11px] text-[#9A9890]">
                      <th className="text-left px-2 py-1.5 w-[110px]">維度</th>
                      <th className="text-left px-2 py-1.5">料號 / 條碼</th>
                      <th className="text-left px-2 py-1.5">備註</th>
                      <th className="text-left px-2 py-1.5 w-[60px]">主要</th>
                      <th className="text-right px-2 py-1.5 w-[200px]">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.skus.map((s) => {
                      const d = drafts[s.id] ?? { sku_code: s.sku_code, notes: s.notes ?? "" };
                      const isThisPending = pendingId === s.id;
                      return (
                        <tr key={s.id} className="border-t border-[#EEECE6]">
                          <td className="px-2 py-1.5 align-middle">
                            <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF4FB] text-[#185FA5]">
                              {SKU_TYPE_LABEL[s.sku_type] ?? s.sku_type}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 align-middle">
                            <input
                              type="text"
                              value={d.sku_code}
                              onChange={(e) =>
                                setDrafts((prev) => ({
                                  ...prev,
                                  [s.id]: { ...d, sku_code: e.target.value },
                                }))
                              }
                              className={`${inputClass} font-mono w-full`}
                              disabled={!canEdit || isThisPending}
                            />
                          </td>
                          <td className="px-2 py-1.5 align-middle">
                            <input
                              type="text"
                              value={d.notes}
                              onChange={(e) =>
                                setDrafts((prev) => ({
                                  ...prev,
                                  [s.id]: { ...d, notes: e.target.value },
                                }))
                              }
                              className={`${inputClass} w-full`}
                              placeholder="（無備註）"
                              disabled={!canEdit || isThisPending}
                            />
                          </td>
                          <td className="px-2 py-1.5 align-middle text-center">
                            {s.is_primary ? (
                              <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF3DE] text-[#3B6D11]">
                                ★
                              </span>
                            ) : (
                              <span className="text-[#9A9890]">—</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 align-middle text-right">
                            <div className="inline-flex gap-1">
                              <button
                                type="button"
                                onClick={() => handleSave(s.id)}
                                className={btnSecondary}
                                disabled={!canEdit || isThisPending}
                              >
                                {isThisPending ? "儲存中⋯" : "儲存"}
                              </button>
                              {!s.is_primary && (
                                <button
                                  type="button"
                                  onClick={() => handleSetPrimary(s.id)}
                                  className={btnSecondary}
                                  disabled={!canEdit || isThisPending}
                                >
                                  設主要
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDelete(s.id)}
                                className={btnDanger}
                                disabled={!canEdit || isThisPending}
                              >
                                刪除
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 新增 SKU 表單 */}
          <form
            onSubmit={handleAdd}
            className="border border-[#EEECE6] rounded p-3 bg-[#F8F7F4]"
          >
            <div className="text-[12px] font-semibold text-[#5A5955] mb-2">＋ 新增料號</div>
            <div className="flex gap-2 items-end flex-wrap">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-[#9A9890] font-medium">維度 *</label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  className={inputClass}
                  disabled={!canEdit || isAdding}
                >
                  {ITEM_SKU_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {SKU_TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-[#9A9890] font-medium">料號 / 條碼 *</label>
                <input
                  type="text"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  className={`${inputClass} font-mono w-[200px]`}
                  placeholder="輸入料號..."
                  disabled={!canEdit || isAdding}
                />
              </div>
              <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
                <label className="text-[11px] text-[#9A9890] font-medium">備註</label>
                <input
                  type="text"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className={inputClass}
                  placeholder="（選填）"
                  disabled={!canEdit || isAdding}
                />
              </div>
              <button
                type="submit"
                className={btnPrimary}
                disabled={!canEdit || isAdding}
              >
                {isAdding ? "建立中⋯" : "＋ 新增"}
              </button>
            </div>
          </form>
        </div>

        <div className="px-5 py-3 border-t border-[#EEECE6] flex items-center justify-end">
          <button type="button" onClick={onClose} className="h-[28px] px-3 rounded text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]">
            關閉
          </button>
        </div>
      </div>
    </div>
  );
}

function Kv({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] text-[#9A9890] mb-0.5">{label}</div>
      <div className={`text-[13px] text-[#2C2C2A] ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}
