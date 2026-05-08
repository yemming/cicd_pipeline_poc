import { redirect } from "next/navigation";

import { getBrandKey } from "@/lib/brands/current";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export const dynamic = "force-dynamic";

type Item = {
  id: string;
  code: string;
  name: string;
  category: string | null;
  control_type: string | null;
  base_uom: string | null;
  spec_description: string | null;
  warranty_months: number | null;
  shelf_life_months: number | null;
  weight_kg: number | null;
  default_supplier_id: string | null;
  is_active: boolean;
};

type Sku = {
  id: string;
  item_id: string;
  sku_type: string | null;
  sku_code: string | null;
  supplier_id: string | null;
  spec: string | null;
  is_primary: boolean | null;
  notes: string | null;
};

type Supplier = { id: string; code: string; name: string };

const SKU_TYPE_LABEL: Record<string, string> = {
  oem: "原廠",
  aftermarket: "副廠",
  alternate: "替代品",
  internal: "內部編號",
};

async function loadData() {
  const supabase = await createClient();
  const brand = getBrandKey();
  const [iRes, sRes, supRes] = await Promise.all([
    supabase
      .from("items")
      .select(
        "id, code, name, category, control_type, base_uom, spec_description, warranty_months, shelf_life_months, weight_kg, default_supplier_id, is_active",
      )
      .eq("brand_id", brand)
      .order("code")
      .limit(150),
    supabase
      .from("item_skus")
      .select("id, item_id, sku_type, sku_code, supplier_id, spec, is_primary, notes")
      .eq("brand_id", brand),
    supabase
      .from("suppliers")
      .select("id, code, name")
      .eq("brand_id", brand),
  ]);
  if (iRes.error) throw new Error(`items: ${iRes.error.message}`);
  if (sRes.error) throw new Error(`skus: ${sRes.error.message}`);
  if (supRes.error) throw new Error(`suppliers: ${supRes.error.message}`);
  const items = (iRes.data ?? []) as unknown as Item[];
  const skus = (sRes.data ?? []) as unknown as Sku[];
  const suppliers = (supRes.data ?? []) as unknown as Supplier[];
  const supplierMap = new Map(suppliers.map((s) => [s.id, s]));
  const skuByItem = new Map<string, Sku[]>();
  for (const s of skus) {
    if (!skuByItem.has(s.item_id)) skuByItem.set(s.item_id, []);
    skuByItem.get(s.item_id)!.push(s);
  }
  return { items, skuByItem, supplierMap };
}

export default async function ItemsInfoPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.ITEM_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視商品資訊的權限</p>
      </main>
    );
  }
  const { items, skuByItem, supplierMap } = await loadData();
  const totalSkus = Array.from(skuByItem.values()).reduce((s, l) => s + l.length, 0);

  return (
    <main className="px-6 py-6 space-y-4">
      <header className="flex items-center gap-3">
        <h1 className="text-[20px] font-semibold">商品資訊</h1>
        <span className="px-2 py-0.5 text-[11px] rounded bg-[#1A3A5C] text-white">
          03.2
        </span>
        <span className="text-[12.5px] text-[#6B6B6B]">
          {`唯讀視圖 · 商品 ${items.length} 筆 · SKU ${totalSkus} 筆`}
        </span>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border border-[#E1E1E1] rounded-md px-4 py-3">
          <div className="text-[11px] text-[#888]">商品數</div>
          <div className="text-[20px] font-bold text-[#1A3A5C] mt-1">{items.length}</div>
        </div>
        <div className="bg-white border border-[#E1E1E1] rounded-md px-4 py-3">
          <div className="text-[11px] text-[#888]">SKU 變體數</div>
          <div className="text-[20px] font-bold text-[#854F0B] mt-1">{totalSkus}</div>
        </div>
        <div className="bg-white border border-[#E1E1E1] rounded-md px-4 py-3">
          <div className="text-[11px] text-[#888]">啟用商品</div>
          <div className="text-[20px] font-bold text-[#3B6D11] mt-1">
            {items.filter((i) => i.is_active).length}
          </div>
        </div>
        <div className="bg-white border border-[#E1E1E1] rounded-md px-4 py-3">
          <div className="text-[11px] text-[#888]">每商品平均 SKU</div>
          <div className="text-[20px] font-bold text-[#0F6E56] mt-1 font-mono">
            {(items.length > 0 ? totalSkus / items.length : 0).toFixed(1)}
          </div>
        </div>
      </div>

      <section className="rounded-md border border-[#E1E1E1] bg-white">
        <header className="px-4 py-3 border-b border-[#E1E1E1] text-[13px] font-semibold">
          📚 商品資訊明細（含 SKU 變體）
        </header>
        <div className="divide-y divide-[#E1E1E1]">
          {items.map((it) => {
            const skus = skuByItem.get(it.id) ?? [];
            return (
              <div key={it.id} className="px-4 py-3">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[13px]">{it.code}</span>
                  <span className="font-semibold">{it.name}</span>
                  <span className="text-[11px] text-[#666]">
                    {`${it.category ?? "—"} · ${it.control_type ?? "—"} · ${it.base_uom ?? "PCS"}`}
                  </span>
                  <span
                    className={`ml-auto px-2 py-0.5 rounded text-[11px] ${
                      it.is_active
                        ? "bg-[#EAF3DE] text-[#3B6D11]"
                        : "bg-[#F0F0F0] text-[#444]"
                    }`}
                  >
                    {it.is_active ? "啟用" : "停用"}
                  </span>
                </div>
                {it.spec_description ? (
                  <div className="text-[11.5px] text-[#666] mt-1">
                    {it.spec_description}
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-3 mt-1.5 text-[11px] text-[#888]">
                  {it.warranty_months !== null ? <span>{`保固 ${it.warranty_months} 個月`}</span> : null}
                  {it.shelf_life_months !== null ? <span>{`效期 ${it.shelf_life_months} 個月`}</span> : null}
                  {it.weight_kg !== null ? <span>{`重 ${Number(it.weight_kg).toFixed(2)} kg`}</span> : null}
                  {it.default_supplier_id ? (
                    <span>
                      {`預設供應商：${supplierMap.get(it.default_supplier_id)?.name ?? "—"}`}
                    </span>
                  ) : null}
                </div>
                {skus.length > 0 ? (
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-1.5">
                    {skus.map((s) => (
                      <div
                        key={s.id}
                        className="px-2 py-1.5 rounded border border-[#E1E1E1] bg-[#FAFAFA] text-[11.5px] flex items-center gap-2"
                      >
                        <span className="px-1.5 py-0.5 rounded bg-[#EBF3FF] text-[#1A3A5C] text-[10.5px]">
                          {SKU_TYPE_LABEL[s.sku_type ?? ""] ?? s.sku_type ?? "—"}
                        </span>
                        <span className="font-mono">{s.sku_code ?? "—"}</span>
                        {s.is_primary ? (
                          <span className="text-[#CC0000] text-[10.5px]">★ 主</span>
                        ) : null}
                        {s.supplier_id ? (
                          <span className="text-[#888] truncate">
                            {supplierMap.get(s.supplier_id)?.name ?? ""}
                          </span>
                        ) : null}
                        {s.spec ? (
                          <span className="text-[#666] truncate">{s.spec}</span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px] text-[#888] mt-1.5">未建立 SKU 變體</div>
                )}
              </div>
            );
          })}
          {items.length === 0 ? (
            <div className="px-4 py-6 text-center text-[#888]">尚無商品資料</div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
