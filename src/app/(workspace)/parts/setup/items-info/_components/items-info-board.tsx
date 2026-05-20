"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { KpiCard } from "@/components/visualization";
import type {
  ItemWithSkus,
  ItemSkuRow,
  ItemsInfoKpis,
  ItemsInfoListItem,
  ItemDimensions,
} from "@/domain/items";
import {
  addItemSkuAction,
  updateItemSkuAction,
  deleteItemSkuAction,
  setPrimaryItemSkuAction,
} from "@/lib/parts-setup/item-sku-actions";

// 注意：DB CHECK constraint 只接受 'oem' | 'internal' | 'alternate' | 'barcode' | 'supplier'
// "use server" 模組不能 re-export 非 async 值，在此重新宣告
const ITEM_SKU_TYPES = ["oem", "internal", "alternate", "barcode", "supplier"] as const;
const SKU_TYPE_LABEL: Record<string, string> = {
  oem: "原廠料號（DMS）",
  internal: "內部料號",
  alternate: "替代料號",
  barcode: "條碼",
  supplier: "供應商料號",
};
const SKU_TYPE_TONE_BG: Record<string, string> = {
  oem: "bg-[#EAF4FB] text-[#185FA5]",
  internal: "bg-[#EBF3FF] text-[#1A3A5C]",
  alternate: "bg-[#FDF3E3] text-[#854F0B]",
  barcode: "bg-[#F2F2F2] text-[#5A5955]",
  supplier: "bg-[#EAF3DE] text-[#3B6D11]",
};

const CONTROL_TONE: Record<string, { cls: string; label: string }> = {
  A: { cls: "bg-[#FDECEA] text-[#CC0000]", label: "A 嚴控" },
  B: { cls: "bg-[#FDF3E3] text-[#854F0B]", label: "B 中等" },
  C: { cls: "bg-[#E8F5F0] text-[#0F6E56]", label: "C 一般" },
  D: { cls: "bg-[#EAF4FB] text-[#185FA5]", label: "D 寬鬆" },
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
  kpis,
  overview,
  dimensions,
}: {
  initialQ: string;
  initialSkuType: string;
  result: ItemWithSkus | null;
  searched: boolean;
  canEdit: boolean;
  kpis: ItemsInfoKpis;
  overview: ItemsInfoListItem[];
  dimensions: ItemDimensions | null;
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

  function jumpToItem(code: string) {
    setQ(code);
    setSkuType("");
    applyFilter(code, "");
  }

  function showBanner(b: Banner) {
    setBanner(b);
    if (b?.ok) {
      setTimeout(() => setBanner(null), 2200);
    }
  }

  const coveragePct = kpis.totalItems > 0
    ? Math.round((kpis.itemsWithSku / kpis.totalItems) * 100)
    : 0;

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

      {/* KPI 條 — 五卡並列、tone 各異 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <KpiCard
          tone="blue"
          layout="horizontal"
          label="啟用商品數"
          value={kpis.totalItems}
        />
        <KpiCard
          tone="teal"
          layout="horizontal"
          label="已建多維度料號"
          value={`${kpis.itemsWithSku} / ${kpis.totalItems}`}
          delta={{
            value: coveragePct,
            tone: coveragePct >= 80 ? "positive" : coveragePct >= 50 ? "neutral" : "negative",
          }}
        />
        <KpiCard
          tone={kpis.itemsMissingSku > 0 ? "amber" : "green"}
          layout="horizontal"
          label="未補料號商品"
          value={kpis.itemsMissingSku}
        />
        <KpiCard
          tone="purple"
          layout="horizontal"
          label="替代料號筆數"
          value={kpis.alternateCount}
        />
        <KpiCard
          tone="gray"
          layout="horizontal"
          label="條碼 / 供應商料號"
          value={`${kpis.barcodeCount} / ${kpis.supplierCount}`}
        />
      </div>

      <div className="bg-[#EAF4FB] border border-[#B5D4F4] rounded-md px-4 py-2.5 text-[12px] text-[#1A3A5C]">
        每件備件可設定多個料號維度：<b>原廠料號（DMS）</b>、<b>內部料號</b>、<b>替代料號</b>、
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
              {(q || skuType) && (
                <button
                  type="button"
                  onClick={() => {
                    setQ("");
                    setSkuType("");
                    startTransition(() => {
                      router.push("/parts/setup/items-info");
                    });
                  }}
                  disabled={isPending}
                  className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                >
                  重置
                </button>
              )}
            </div>
          </section>

          {/* 詳情卡 / 空狀態 / Overview 列表 */}
          {searched && !result && (
            <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-10 text-center text-[12px] text-[#9A9890]">
              查無料號 <b>{initialQ}</b>，請確認輸入正確或換一個維度查詢
            </div>
          )}

          {result && (
            <DetailCard
              item={result}
              canEdit={canEdit}
              dimensions={dimensions}
              onOpenManage={() => setManageOpen(true)}
            />
          )}

          {!searched && !result && (
            <ItemsOverviewList
              overview={overview}
              isPending={isPending}
              onJump={jumpToItem}
            />
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
                            <span className={`px-1 py-0.5 rounded-md text-[10px] ${SKU_TYPE_TONE_BG[r.sku_type] ?? "bg-[#EAF4FB] text-[#185FA5]"}`}>
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

          {/* 維度分佈小卡 */}
          {kpis.byType.length > 0 && (
            <div className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden mt-2">
              <div className="px-3 py-2 bg-[#F8F7F4] border-b border-[#EEECE6] text-[12px] font-semibold text-[#5A5955]">
                維度分佈
              </div>
              <ul className="divide-y divide-[#EEECE6]">
                {kpis.byType.map((t) => (
                  <li key={t.sku_type} className="px-3 py-1.5 flex items-center justify-between">
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[10.5px] ${
                        SKU_TYPE_TONE_BG[t.sku_type] ?? "bg-[#EAF4FB] text-[#185FA5]"
                      }`}
                    >
                      {SKU_TYPE_LABEL[t.sku_type] ?? t.sku_type}
                    </span>
                    <span className="text-[12px] font-semibold text-[#2C2C2A]">{t.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      {manageOpen && result && (
        <ManageSkuModal
          item={result}
          canEdit={canEdit}
          dimensions={dimensions}
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

// ─────────────────────────────────────────────
// 詳情卡片
// ─────────────────────────────────────────────
function DetailCard({
  item,
  canEdit,
  dimensions,
  onOpenManage,
}: {
  item: ItemWithSkus;
  canEdit: boolean;
  dimensions: ItemDimensions | null;
  onOpenManage: () => void;
}) {
  const control = item.control_type ? CONTROL_TONE[item.control_type] ?? null : null;
  const alternates = item.skus.filter((s) => s.sku_type === "alternate");
  const supplierSkus = item.skus.filter((s) => s.sku_type === "supplier");
  const fitments = dimensions?.fitments ?? [];
  const pricing = dimensions?.supplierPricing ?? [];

  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
            {item.name} — 料號詳情
          </h2>
          <span className="font-mono text-[11px] text-[#5A5955]">{item.code}</span>
          {control && (
            <span className={`px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${control.cls}`}>
              {control.label}
            </span>
          )}
          {item.category && (
            <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#EEF4FB] text-[#185FA5] whitespace-nowrap">
              {item.category}
            </span>
          )}
          {!item.is_active && (
            <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#6B6A68] whitespace-nowrap">
              已停用
            </span>
          )}
        </div>
        <button
          type="button"
          disabled={!canEdit}
          title={canEdit ? "管理 SKU 多維度料號" : "沒有權限"}
          onClick={onOpenManage}
          className="h-[26px] px-3 rounded text-[11.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          管理 SKU
        </button>
      </header>
      <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Kv label={SKU_TYPE_LABEL.oem} mono value={getMeta(item.skus, "oem")?.sku_code ?? "—"} />
          <Kv
            label={SKU_TYPE_LABEL.internal}
            mono
            value={getMeta(item.skus, "internal")?.sku_code ?? item.code ?? "—"}
          />
          {alternates.length === 0 && (
            <Kv label="替代料號" value="—（尚未設定）" />
          )}
          {alternates.map((s, idx) => (
            <div key={s.id}>
              <div className="text-[11px] text-[#9A9890] mb-0.5">
                替代料號 {idx + 1}
                {s.notes && <span className="ml-1 text-[#854F0B]">⚠ {s.notes}</span>}
              </div>
              <div className="font-mono text-[13px] text-[#2C2C2A]">{s.sku_code}</div>
            </div>
          ))}
          {supplierSkus.map((s, idx) => (
            <div key={s.id}>
              <div className="text-[11px] text-[#9A9890] mb-0.5">
                供應商料號 {idx + 1}
                {s.notes && <span className="ml-1 text-[#854F0B]">⚠ {s.notes}</span>}
              </div>
              <div className="font-mono text-[13px] text-[#2C2C2A]">{s.sku_code}</div>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <Kv
            label={SKU_TYPE_LABEL.barcode}
            mono
            value={getMeta(item.skus, "barcode")?.sku_code ?? "—"}
          />
          <Kv label="規格描述" value={item.spec_description ?? "—"} />
          <Kv label="基本單位 (UoM)" value={item.base_uom ?? "—"} />
          <Kv
            label="重量 / 體積"
            mono
            value={
              [
                item.weight_kg != null ? `${item.weight_kg} kg` : null,
                item.volume_cm3 != null ? `${item.volume_cm3} cm³` : null,
              ]
                .filter(Boolean)
                .join(" / ") || "—"
            }
          />
        </div>
      </div>

      {/* 適配車型 chip 列 */}
      {fitments.length > 0 && (
        <div className="px-4 py-3 border-t border-[#EEECE6]">
          <div className="text-[11px] text-[#9A9890] mb-1.5 font-medium">適配車型</div>
          <div className="flex flex-wrap gap-1.5">
            {fitments.slice(0, 12).map((f) => (
              <span
                key={f.id}
                className={`px-1.5 py-0.5 rounded-md text-[11px] ${
                  f.is_verified
                    ? "bg-[#EAF3DE] text-[#3B6D11]"
                    : "bg-[#FDF3E3] text-[#854F0B]"
                }`}
              >
                {f.vehicle_display}
                {(f.year_start || f.year_end) && (
                  <span className="ml-1 opacity-75 font-mono">
                    {f.year_start ?? "?"}-{f.year_end ?? "?"}
                  </span>
                )}
                {!f.is_verified && <span className="ml-1">未驗證</span>}
              </span>
            ))}
            {fitments.length > 12 && (
              <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#5A5955]">
                +{fitments.length - 12} 個更多
              </span>
            )}
          </div>
        </div>
      )}

      {/* 供應商定價列 */}
      {pricing.length > 0 && (
        <div className="px-4 py-3 border-t border-[#EEECE6]">
          <div className="text-[11px] text-[#9A9890] mb-1.5 font-medium">供應商定價</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
            {pricing.slice(0, 6).map((p) => (
              <div
                key={p.id}
                className={`flex items-center gap-2 px-2 py-1 rounded border text-[12px] ${
                  p.is_primary
                    ? "border-[#0F6E56] bg-[#EAF3DE]"
                    : "border-[#EEECE6] bg-white"
                }`}
              >
                {p.is_primary && (
                  <span className="px-1 py-0.5 rounded text-[10px] bg-[#0F6E56] text-white">主</span>
                )}
                <span className="text-[#2C2C2A] truncate flex-1">{p.supplier_name}</span>
                <span className="font-mono text-[#185FA5] font-semibold">
                  {p.currency} {p.unit_price.toLocaleString()}
                </span>
                <span className="text-[10.5px] text-[#9A9890]">
                  {p.lead_time_days}d
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="px-4 py-2 border-t border-[#EEECE6] bg-white text-[11px] text-[#9A9890]">
        多維度查詢：原廠料號 / 內部料號 / 替代料號 / 條碼 / 供應商料號任一輸入皆可定位到此商品
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// 沒搜尋時顯示的「最近編輯商品列表」
// ─────────────────────────────────────────────
function ItemsOverviewList({
  overview,
  isPending,
  onJump,
}: {
  overview: ItemsInfoListItem[];
  isPending: boolean;
  onJump: (code: string) => void;
}) {
  if (overview.length === 0) {
    return (
      <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-10 text-center text-[12px] text-[#9A9890]">
        本品牌尚無啟用中的商品。請先到「商品基礎資料」建立商品，再回此頁設定多維度料號。
      </div>
    );
  }
  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
        <h2 className="text-[13px] font-semibold text-[#2C2C2A]">最近編輯商品（點擊查看料號）</h2>
        <span className="text-[11px] text-[#9A9890]">共 {overview.length} 筆（最近異動排前）</span>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-[#F8F7F4] text-[11px] text-[#9A9890]">
              <th className="text-left px-3 py-1.5 font-medium w-[120px]">商品代碼</th>
              <th className="text-left px-3 py-1.5 font-medium">名稱</th>
              <th className="text-left px-3 py-1.5 font-medium w-[120px]">品類</th>
              <th className="text-left px-3 py-1.5 font-medium w-[80px]">管控</th>
              <th className="text-left px-3 py-1.5 font-medium w-[100px]">料號數</th>
              <th className="text-left px-3 py-1.5 font-medium w-[80px]">主要</th>
            </tr>
          </thead>
          <tbody>
            {overview.map((it) => {
              const tone = it.control_type ? CONTROL_TONE[it.control_type] ?? null : null;
              return (
                <tr
                  key={it.id}
                  className="border-t border-[#EEECE6] hover:bg-[#F8F7F4] cursor-pointer"
                  onClick={() => !isPending && onJump(it.code)}
                >
                  <td className="px-3 py-1.5 font-mono text-[#1A3A5C] font-semibold">{it.code}</td>
                  <td className="px-3 py-1.5 text-[#2C2C2A]">{it.name}</td>
                  <td className="px-3 py-1.5">
                    {it.category ? (
                      <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#EEF4FB] text-[#185FA5]">
                        {it.category}
                      </span>
                    ) : (
                      <span className="text-[#9A9890]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    {tone ? (
                      <span className={`px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${tone.cls}`}>
                        {tone.label}
                      </span>
                    ) : (
                      <span className="text-[#9A9890]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    {it.sku_count === 0 ? (
                      <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">
                        未補
                      </span>
                    ) : (
                      <span className="font-mono text-[#2C2C2A]">{it.sku_count} 筆</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    {it.has_primary ? (
                      <span className="text-[#3B6D11]">★ 已設</span>
                    ) : (
                      <span className="text-[#9A9890]">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// 管理 SKU Modal（多 Tab：料號維度 / 適用車型 / 供應商定價）
// ─────────────────────────────────────────────
type ManageTab = "skus" | "fitments" | "pricing";

function ManageSkuModal({
  item,
  canEdit,
  dimensions,
  onClose,
  onChanged,
  showBanner,
}: {
  item: ItemWithSkus;
  canEdit: boolean;
  dimensions: ItemDimensions | null;
  onClose: () => void;
  onChanged: () => void;
  showBanner: (b: Banner) => void;
}) {
  const [tab, setTab] = useState<ManageTab>("skus");

  // 計算「保存進度」：5 種 sku_type 各填一個就 100%
  const completion = useMemo(() => {
    const filled = new Set(item.skus.map((s) => s.sku_type));
    const all = ITEM_SKU_TYPES.length;
    return {
      filled: filled.size,
      total: all,
      pct: Math.round((filled.size / all) * 100),
    };
  }, [item.skus]);

  const fitments = dimensions?.fitments ?? [];
  const pricing = dimensions?.supplierPricing ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-[#EEECE6] flex items-center gap-3">
          <h2 className="text-[14px] font-semibold text-[#2C2C2A]">
            管理多維度料號 — {item.name}
          </h2>
          <span className="px-1.5 py-0.5 text-[11px] rounded-md bg-[#FDF3E3] text-[#854F0B]">
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

        {/* 保存進度 indicator */}
        <div className="px-5 pt-3 pb-2">
          <div className="flex items-center gap-2 text-[11.5px] text-[#5A5955]">
            <span>料號維度完整度</span>
            <span className="font-semibold text-[#1A3A5C]">
              {completion.filled} / {completion.total}
            </span>
            <span className="ml-auto font-mono text-[#1A3A5C] font-semibold">{completion.pct}%</span>
          </div>
          <div className="h-1.5 mt-1 bg-[#F2F2F2] rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                completion.pct >= 80
                  ? "bg-[#0F6E56]"
                  : completion.pct >= 50
                  ? "bg-[#185FA5]"
                  : "bg-[#854F0B]"
              }`}
              style={{ width: `${completion.pct}%` }}
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="px-5 border-b border-[#EEECE6] flex gap-0">
          {[
            { key: "skus" as ManageTab, label: "料號維度", count: item.skus.length },
            { key: "fitments" as ManageTab, label: "適用車型", count: fitments.length },
            { key: "pricing" as ManageTab, label: "供應商定價", count: pricing.length },
          ].map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`h-[36px] px-4 text-[12.5px] font-medium border-b-2 -mb-px ${
                  active
                    ? "border-[#1A3A5C] text-[#1A3A5C]"
                    : "border-transparent text-[#5A5955] hover:text-[#1A3A5C]"
                }`}
              >
                {t.label}
                <span
                  className={`ml-1.5 px-1.5 py-0.5 rounded-md text-[10.5px] ${
                    active ? "bg-[#EAF4FB] text-[#185FA5]" : "bg-[#F2F2F2] text-[#5A5955]"
                  }`}
                >
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="px-5 py-4">
          {tab === "skus" && (
            <SkusTab
              item={item}
              canEdit={canEdit}
              showBanner={showBanner}
              onChanged={onChanged}
            />
          )}
          {tab === "fitments" && <FitmentsTab fitments={fitments} />}
          {tab === "pricing" && <PricingTab pricing={pricing} />}
        </div>

        <div className="px-5 py-3 border-t border-[#EEECE6] flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-[28px] px-3 rounded text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Tab 1: 料號維度（既有 CRUD）
// ─────────────────────────────────────────────
function SkusTab({
  item,
  canEdit,
  showBanner,
  onChanged,
}: {
  item: ItemWithSkus;
  canEdit: boolean;
  showBanner: (b: Banner) => void;
  onChanged: () => void;
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
      showBanner({ ok: true, msg: "已更新料號" });
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
      showBanner({ ok: true, msg: "已刪除料號" });
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
      showBanner({ ok: true, msg: "已設為主要" });
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
      showBanner({ ok: true, msg: "已新增料號" });
      setNewCode("");
      setNewNotes("");
      onChanged();
    } else {
      showBanner({ ok: false, msg: res.error });
    }
  }

  const busy = pendingId !== null || isAdding;

  return (
    <div className={busy ? "pointer-events-none opacity-60" : ""}>
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
                        <span
                          className={`px-1.5 py-0.5 rounded-md text-[11px] ${
                            SKU_TYPE_TONE_BG[s.sku_type] ?? "bg-[#EAF4FB] text-[#185FA5]"
                          }`}
                        >
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
          <button type="submit" className={btnPrimary} disabled={!canEdit || isAdding}>
            {isAdding ? "建立中⋯" : "＋ 新增"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────
// Tab 2: 適用車型（readonly view，編輯走 /parts/setup/compatibility 頁）
// ─────────────────────────────────────────────
function FitmentsTab({
  fitments,
}: {
  fitments: ItemDimensions["fitments"];
}) {
  if (fitments.length === 0) {
    return (
      <div className="border border-dashed border-[#D5D3CB] rounded px-4 py-10 text-center text-[12px] text-[#9A9890]">
        尚未設定適用車型。請至「適配設定」頁建立對應關係。
      </div>
    );
  }
  return (
    <div>
      <div className="text-[11.5px] text-[#9A9890] mb-2">
        本料號適配車型（共 {fitments.length} 筆）— 維護請至{" "}
        <Link href="/parts/setup/compatibility" className="text-[#185FA5] hover:underline">
          適配設定
        </Link>{" "}
        頁
      </div>
      <div className="border border-[#EEECE6] rounded overflow-hidden">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-[#F8F7F4] text-[11px] text-[#9A9890]">
              <th className="text-left px-3 py-1.5 font-medium">車型</th>
              <th className="text-left px-3 py-1.5 font-medium w-[140px]">適用年份</th>
              <th className="text-left px-3 py-1.5 font-medium w-[100px]">驗證狀態</th>
              <th className="text-left px-3 py-1.5 font-medium">備註</th>
            </tr>
          </thead>
          <tbody>
            {fitments.map((f) => (
              <tr key={f.id} className="border-t border-[#EEECE6]">
                <td className="px-3 py-1.5 text-[#2C2C2A] font-medium">{f.vehicle_display}</td>
                <td className="px-3 py-1.5 font-mono text-[#5A5955]">
                  {f.year_start ?? "?"} - {f.year_end ?? "?"}
                </td>
                <td className="px-3 py-1.5">
                  {f.is_verified ? (
                    <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF3DE] text-[#3B6D11]">
                      已驗證
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">
                      待驗證
                    </span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-[#5A5955]">{f.notes ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Tab 3: 供應商定價（readonly view，編輯走 /admin/master-data/supplier-pricing）
// ─────────────────────────────────────────────
function PricingTab({
  pricing,
}: {
  pricing: ItemDimensions["supplierPricing"];
}) {
  if (pricing.length === 0) {
    return (
      <div className="border border-dashed border-[#D5D3CB] rounded px-4 py-10 text-center text-[12px] text-[#9A9890]">
        尚未設定供應商定價。請至「供應商定價」頁建立報價資料。
      </div>
    );
  }
  return (
    <div>
      <div className="text-[11.5px] text-[#9A9890] mb-2">
        本料號供應商定價（共 {pricing.length} 筆）— 維護請至{" "}
        <Link href="/admin/master-data/supplier-pricing" className="text-[#185FA5] hover:underline">
          供應商定價
        </Link>{" "}
        頁
      </div>
      <div className="border border-[#EEECE6] rounded overflow-hidden">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-[#F8F7F4] text-[11px] text-[#9A9890]">
              <th className="text-left px-3 py-1.5 font-medium w-[60px]">主要</th>
              <th className="text-left px-3 py-1.5 font-medium">供應商</th>
              <th className="text-right px-3 py-1.5 font-medium w-[140px]">單價</th>
              <th className="text-left px-3 py-1.5 font-medium w-[80px]">貨幣</th>
              <th className="text-right px-3 py-1.5 font-medium w-[100px]">交期 (天)</th>
              <th className="text-right px-3 py-1.5 font-medium w-[110px]">最小訂量</th>
              <th className="text-left px-3 py-1.5 font-medium w-[80px]">狀態</th>
            </tr>
          </thead>
          <tbody>
            {pricing.map((p) => (
              <tr key={p.id} className="border-t border-[#EEECE6]">
                <td className="px-3 py-1.5">
                  {p.is_primary ? (
                    <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#0F6E56] text-white">
                      ★ 主
                    </span>
                  ) : (
                    <span className="text-[#9A9890]">—</span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-[#2C2C2A] font-medium">{p.supplier_name}</td>
                <td className="px-3 py-1.5 text-right font-mono text-[#185FA5] font-semibold">
                  {p.unit_price.toLocaleString()}
                </td>
                <td className="px-3 py-1.5 text-[#5A5955]">{p.currency}</td>
                <td className="px-3 py-1.5 text-right font-mono text-[#5A5955]">
                  {p.lead_time_days}
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-[#5A5955]">
                  {p.min_order_qty.toLocaleString()}
                </td>
                <td className="px-3 py-1.5">
                  {p.is_active ? (
                    <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF3DE] text-[#3B6D11]">
                      啟用
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#6B6A68]">
                      停用
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
