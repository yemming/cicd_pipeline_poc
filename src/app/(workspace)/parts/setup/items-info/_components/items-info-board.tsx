"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { ItemWithSkus, ItemSkuRow } from "@/domain/items";

const SKU_TYPE_LABEL: Record<string, string> = {
  oem: "原廠料號（DMS）",
  internal: "內部料號",
  alt: "替代料號",
  ean: "EAN 條碼",
  upc: "UPC 條碼",
};

function getMeta(skus: ItemSkuRow[], type: string): ItemSkuRow | null {
  return skus.find((s) => s.sku_type === type) ?? null;
}

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

  function applyFilter() {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (skuType) params.set("sku_type", skuType);
    startTransition(() => {
      router.push(`/parts/setup/items-info${params.toString() ? "?" + params.toString() : ""}`);
    });
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
        <b>EAN 條碼</b>，系統均可相互查詢對應。
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
                  <option value="oem">原廠料號（DMS）</option>
                  <option value="internal">內部料號</option>
                  <option value="alt">替代料號</option>
                  <option value="ean">EAN 條碼</option>
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
                onClick={applyFilter}
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
                  title={canEdit ? "Phase 2 開放" : "沒有權限"}
                  className="h-[26px] px-3 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] disabled:opacity-50 cursor-not-allowed"
                >
                  編輯
                </button>
              </header>
              <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Kv label={SKU_TYPE_LABEL.oem} mono value={getMeta(result.skus, "oem")?.sku_code ?? "—"} />
                  <Kv label={SKU_TYPE_LABEL.internal} mono value={getMeta(result.skus, "internal")?.sku_code ?? result.code ?? "—"} />
                  {result.skus
                    .filter((s) => s.sku_type === "alt")
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
                </div>
                <div className="flex flex-col gap-2">
                  <Kv label={SKU_TYPE_LABEL.ean} mono value={getMeta(result.skus, "ean")?.sku_code ?? "—"} />
                  <Kv label="規格描述" value={result.spec_description ?? "—"} />
                  <Kv label="基本單位 (UoM)" value={result.base_uom ?? "—"} />
                  <Kv label="重量" value={result.weight_kg ? `${result.weight_kg} kg` : "—"} mono />
                </div>
              </div>
              <div className="px-4 py-2 border-t border-[#EEECE6] bg-white text-[11px] text-[#9A9890]">
                💡 多維度查詢：原廠料號 / 內部料號 / 替代料號 / EAN 條碼任一輸入皆可定位到此商品
              </div>
            </section>
          )}
          {!searched && !result && (
            <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-10 text-center text-[12px] text-[#9A9890]">
              請輸入料號或條碼開始查詢
            </div>
          )}
        </div>

        {/* 右欄 placeholder：最近查詢紀錄（Phase 1 暫不接 storage） */}
        <aside className="w-[200px] flex-shrink-0">
          <div className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-[#F8F7F4] border-b border-[#EEECE6] text-[12px] font-semibold text-[#5A5955]">
              最近查詢紀錄
            </div>
            <div className="px-3 py-6 text-[11px] text-[#9A9890] text-center">
              （Phase 1 未接 localStorage，下版實作）
            </div>
          </div>
        </aside>
      </div>
    </main>
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
