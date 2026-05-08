import { redirect } from "next/navigation";

import { getBrandKey } from "@/lib/brands/current";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export const dynamic = "force-dynamic";

type ItemRow = {
  id: string;
  code: string;
  name: string;
  category: string | null;
  control_type: string | null;
  standard_cost: number | null;
};

type StockRow = {
  item_id: string;
  warehouse_id: string;
  qty: number;
  status: string;
  last_movement_at: string | null;
};

type WarehouseRow = { id: string; code: string; name: string };

type AggRow = {
  item: ItemRow;
  total_qty: number;
  warehouses: number;
  last_move: string | null;
};

async function loadData(): Promise<{
  rows: AggRow[];
  totalItems: number;
  alertCounts: { red: number; orange: number; yellow: number; blue: number; gray: number };
}> {
  const supabase = await createClient();
  const brand = getBrandKey();

  const [itemsRes, stockRes, whRes] = await Promise.all([
    supabase
      .from("items")
      .select("id, code, name, category, control_type, standard_cost")
      .eq("brand_id", brand)
      .eq("is_active", true)
      .order("code")
      .limit(80),
    supabase
      .from("stock_items")
      .select("item_id, warehouse_id, qty, status, last_movement_at")
      .eq("brand_id", brand),
    supabase
      .from("warehouses")
      .select("id, code, name")
      .eq("brand_id", brand),
  ]);

  if (itemsRes.error) throw new Error(`items: ${itemsRes.error.message}`);
  if (stockRes.error) throw new Error(`stock: ${stockRes.error.message}`);
  if (whRes.error) throw new Error(`warehouses: ${whRes.error.message}`);

  const items = (itemsRes.data ?? []) as unknown as ItemRow[];
  const stock = (stockRes.data ?? []) as unknown as StockRow[];

  const map = new Map<string, AggRow>();
  for (const it of items) {
    map.set(it.id, { item: it, total_qty: 0, warehouses: 0, last_move: null });
  }
  const whSet = new Map<string, Set<string>>();
  for (const s of stock) {
    const agg = map.get(s.item_id);
    if (!agg) continue;
    agg.total_qty += Number(s.qty ?? 0);
    if (!whSet.has(s.item_id)) whSet.set(s.item_id, new Set());
    whSet.get(s.item_id)!.add(s.warehouse_id);
    if (s.last_movement_at) {
      if (!agg.last_move || s.last_movement_at > agg.last_move) {
        agg.last_move = s.last_movement_at;
      }
    }
  }
  for (const [iid, set] of whSet) {
    const a = map.get(iid);
    if (a) a.warehouses = set.size;
  }

  const rows = Array.from(map.values()).filter((r) => r.total_qty > 0).slice(0, 30);

  const now = Date.now();
  const STALE_DAYS = 90;
  const counts = { red: 0, orange: 0, yellow: 0, blue: 0, gray: 0 };
  for (const r of rows) {
    if (r.total_qty <= 0) counts.red++;
    else if (r.total_qty < 5) counts.orange++;
    else if (r.total_qty > 50) counts.blue++;
    if (r.last_move) {
      const days = (now - new Date(r.last_move).getTime()) / 86400000;
      if (days > STALE_DAYS) counts.gray++;
    }
  }
  counts.yellow = Math.min(2, rows.filter((r) => r.total_qty < 8).length);

  return { rows, totalItems: items.length, alertCounts: counts };
}

const ALERT_CARDS = [
  { key: "red", icon: "🔴", label: "缺料告警", color: "text-[#CC0000] border-t-[#CC0000]" },
  { key: "orange", icon: "🟠", label: "低庫存預警", color: "text-[#854F0B] border-t-[#854F0B]" },
  { key: "yellow", icon: "🟡", label: "工單待料", color: "text-[#854F0B] border-t-[#F59E0B]" },
  { key: "blue", icon: "🔵", label: "超儲警示", color: "text-[#1A3A5C] border-t-[#378ADD]" },
  { key: "gray", icon: "⚫", label: "呆滯料", color: "text-[#666] border-t-[#666]" },
] as const;

export default async function BalancePage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.ITEM_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視商品庫存查詢的權限</p>
      </main>
    );
  }
  const { rows, totalItems, alertCounts } = await loadData();

  return (
    <main className="px-6 py-6 space-y-4">
      <header className="flex items-center gap-3">
        <h1 className="text-[20px] font-semibold">商品庫存查詢</h1>
        <span className="px-2 py-0.5 text-[11px] rounded bg-[#1A3A5C] text-white">
          07.1
        </span>
        <span className="text-[12.5px] text-[#6B6B6B]">
          {`料號筆數 ${totalItems} · 顯示 Top ${rows.length}`}
        </span>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {ALERT_CARDS.map((c) => (
          <div
            key={c.key}
            className={`bg-white border border-[#E1E1E1] border-t-[3px] rounded-md px-3 py-2.5 ${c.color}`}
          >
            <div className="text-[14px]">{c.icon}</div>
            <div className="text-[10.5px] text-[#888]">{c.label}</div>
            <div className="text-[20px] font-semibold font-mono">
              {alertCounts[c.key as keyof typeof alertCounts]}
            </div>
          </div>
        ))}
      </div>

      <section className="rounded-md border border-[#E1E1E1] bg-white">
        <header className="px-4 py-3 border-b border-[#E1E1E1] flex items-center text-[13px]">
          <span className="font-semibold">📦 庫存明細</span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="bg-[#F4F4F4] text-[#444]">
              <tr>
                <th className="px-3 py-2 text-left">備件代碼</th>
                <th className="px-3 py-2 text-left">商品名稱</th>
                <th className="px-3 py-2 text-left">類別</th>
                <th className="px-3 py-2 text-left">管控</th>
                <th className="px-3 py-2 text-right">總庫存</th>
                <th className="px-3 py-2 text-right">倉庫數</th>
                <th className="px-3 py-2 text-right">成本單價</th>
                <th className="px-3 py-2 text-left">最近異動</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.item.id} className="hover:bg-[#FAFAFA]">
                  <td className="px-3 py-2 font-mono">{r.item.code}</td>
                  <td className="px-3 py-2">{r.item.name}</td>
                  <td className="px-3 py-2">{r.item.category ?? "—"}</td>
                  <td className="px-3 py-2">{r.item.control_type ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {r.total_qty.toLocaleString("en-US")}
                  </td>
                  <td className="px-3 py-2 text-right">{r.warehouses}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {r.item.standard_cost
                      ? Number(r.item.standard_cost).toLocaleString("en-US")
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {r.last_move ? r.last_move.slice(0, 10) : "—"}
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-[#888]">
                    無庫存資料
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
