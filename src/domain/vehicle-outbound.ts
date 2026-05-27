/**
 * RS_INV06 出庫管理 domain helper — server-only。
 *
 * 純查詢（read-only aggregate，不建表）。把多個既有來源 union 成統一的
 * OutboundRow，供 /sales/inventory/outbound 列表頁顯示。
 *
 * 出庫四大來源（依設計稿 RS_INV06）：
 *   - SALE 銷售出庫：new_car_inventory.status in (sold, delivered)（用 delivered_date，
 *       沒有就 fallback sold_date）+ used_car_inventory.status='sold'（sold_date）。
 *       毛利 = 售價(list_price / listing_price) − total_cost。
 *   - TRANSFER 調撥出庫：vehicle_transfers.status in (in_transit, completed)。
 *   - DEMO 試乘 / 展覽：test_ride_bookings 表（目前不存在 → 顯示 0/空）。
 *   - SCRAP 報廢 / 下架：new_car_inventory.status='damaged'。
 *
 * 天條：UI 只 import 本 helper，不直連 supabase。
 */

import "server-only";

import { createClient } from "@/lib/supabase/server";

// ── 型別 ──────────────────────────────────────────────────────────────

export type OutboundType = "SALE" | "TRANSFER" | "DEMO" | "SCRAP";
export type OutboundVehicleKind = "NEW" | "USED";

export type OutboundRow = {
  /** 合成 id（來源表 + 原始 id），DataGrid rowKey 用 */
  id: string;
  /** 出庫單號（合成，無實體出庫單時用來源 + 短碼） */
  outbound_no: string;
  type: OutboundType;
  vehicle_kind: OutboundVehicleKind;
  model: string;
  /** VIN 末 6 碼（不足補原值） */
  vin_last6: string;
  vin: string | null;
  warehouse: string | null;
  /** 對象 / 原因（銷售=客戶/訂單、調撥=去向、報廢=原因） */
  target: string;
  /** 出庫日期 YYYY-MM-DD */
  outbound_date: string | null;
  total_cost: number | null;
  /** 售價（僅 SALE 有數值，其餘為 null） */
  price: number | null;
  /** 毛利 = price − total_cost（僅 SALE 有數值） */
  margin: number | null;
  /** 非銷售出庫的備註文字（調撥 / 展覽借用 / 報廢） */
  note: string | null;
};

export type OutboundFilters = {
  brandId: string;
  /** 出庫類型：SALE / TRANSFER / DEMO / SCRAP（空 = 全部） */
  type?: OutboundType | "";
  /** 月份篩選 YYYY-MM（空 = 全部） */
  month?: string;
  /** 車款 / VIN 模糊搜尋 */
  q?: string;
};

export type OutboundKpi = {
  /** 本月出庫總台數 */
  totalThisMonth: number;
  /** 本月銷售出庫 */
  saleThisMonth: number;
  /** 本月調撥出庫 */
  transferThisMonth: number;
  /** 本月其他出庫（試乘 / 展覽 / 報廢） */
  otherThisMonth: number;
};

export type OutboundData = {
  rows: OutboundRow[];
  kpi: OutboundKpi;
};

// ── 工具 ──────────────────────────────────────────────────────────────

function vinLast6(vin: string | null): string {
  if (!vin) return "—";
  return vin.length > 6 ? vin.slice(-6) : vin;
}

function shortCode(id: string): string {
  return id.replace(/-/g, "").slice(0, 6).toUpperCase();
}

function toMonth(d: string | null): string | null {
  if (!d) return null;
  return d.slice(0, 7); // YYYY-MM
}

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ── 主查詢：把四來源 union 成 OutboundRow[] ──────────────────────────────

export async function listOutbound(filters: OutboundFilters): Promise<OutboundData> {
  const supabase = await createClient();
  const brandId = filters.brandId;

  // 1) 新車：sold + delivered（SALE）/ damaged（SCRAP）
  const { data: newCars, error: newErr } = await supabase
    .from("new_car_inventory")
    .select(
      "id, vin, status, sold_date, delivered_date, total_cost, list_price, color, year, organization_id, vehicle_models(display_name), organizations(name)"
    )
    .eq("brand_id", brandId)
    .in("status", ["sold", "delivered", "damaged"]);
  if (newErr) throw new Error(`listOutbound(new): ${newErr.message}`);

  // 2) 中古車：sold（SALE）
  const { data: usedCars, error: usedErr } = await supabase
    .from("used_car_inventory")
    .select(
      "id, vin, status, sold_date, total_cost, cost, listing_price, model_display_name, color, year, organizations(name)"
    )
    .eq("brand_id", brandId)
    .eq("status", "sold");
  if (usedErr) throw new Error(`listOutbound(used): ${usedErr.message}`);

  // 3) 調撥：in_transit + completed（TRANSFER）
  const { data: transfers, error: trErr } = await supabase
    .from("vehicle_transfers")
    .select(
      "id, transfer_no, vehicle_kind, new_car_id, used_car_id, from_warehouse_id, to_warehouse_id, transfer_date, freight_amount, reason, status"
    )
    .eq("brand_id", brandId)
    .in("status", ["in_transit", "completed"]);
  if (trErr) throw new Error(`listOutbound(transfer): ${trErr.message}`);

  // 倉庫名查找（調撥的 from/to 倉）— 只在有調撥資料時撈
  const warehouseNames = new Map<string, string>();
  if ((transfers ?? []).length > 0) {
    const ids = new Set<string>();
    for (const t of transfers as Array<Record<string, unknown>>) {
      if (t.from_warehouse_id) ids.add(t.from_warehouse_id as string);
      if (t.to_warehouse_id) ids.add(t.to_warehouse_id as string);
    }
    if (ids.size > 0) {
      const { data: whs } = await supabase
        .from("warehouses")
        .select("id, name")
        .in("id", Array.from(ids));
      for (const w of (whs ?? []) as Array<{ id: string; name: string }>) {
        warehouseNames.set(w.id, w.name);
      }
    }
  }

  const rows: OutboundRow[] = [];

  // ── 新車 → SALE / SCRAP ──
  type NewJoined = {
    id: string;
    vin: string | null;
    status: string;
    sold_date: string | null;
    delivered_date: string | null;
    total_cost: unknown;
    list_price: unknown;
    color: string | null;
    year: number | null;
    vehicle_models: { display_name?: string } | null;
    organizations: { name?: string } | null;
  };
  for (const r of (newCars ?? []) as unknown as NewJoined[]) {
    const model = r.vehicle_models?.display_name ?? "（未指定車款）";
    const warehouse = r.organizations?.name ?? null;
    const cost = num(r.total_cost);
    if (r.status === "damaged") {
      rows.push({
        id: `new:${r.id}`,
        outbound_no: `OUT-SCRAP-${shortCode(r.id)}`,
        type: "SCRAP",
        vehicle_kind: "NEW",
        model,
        vin_last6: vinLast6(r.vin),
        vin: r.vin,
        warehouse,
        target: "碰撞損壞 / 召回報廢",
        outbound_date: r.sold_date ?? r.delivered_date ?? null,
        total_cost: cost,
        price: null,
        margin: null,
        note: "報廢 / 下架",
      });
    } else {
      // sold / delivered → SALE
      const price = num(r.list_price);
      const date = r.delivered_date ?? r.sold_date ?? null;
      rows.push({
        id: `new:${r.id}`,
        outbound_no: `OUT-NC-${shortCode(r.id)}`,
        type: "SALE",
        vehicle_kind: "NEW",
        model,
        vin_last6: vinLast6(r.vin),
        vin: r.vin,
        warehouse,
        target: "銷售交車",
        outbound_date: date,
        total_cost: cost,
        price,
        margin: price != null && cost != null ? price - cost : null,
        note: null,
      });
    }
  }

  // ── 中古車 → SALE ──
  type UsedJoined = {
    id: string;
    vin: string | null;
    status: string;
    sold_date: string | null;
    total_cost: unknown;
    cost: unknown;
    listing_price: unknown;
    model_display_name: string | null;
    color: string | null;
    year: number | null;
    organizations: { name?: string } | null;
  };
  for (const r of (usedCars ?? []) as unknown as UsedJoined[]) {
    const cost = num(r.total_cost) ?? num(r.cost);
    const price = num(r.listing_price);
    rows.push({
      id: `used:${r.id}`,
      outbound_no: `OUT-UC-${shortCode(r.id)}`,
      type: "SALE",
      vehicle_kind: "USED",
      model: r.model_display_name ?? "（未指定車款）",
      vin_last6: vinLast6(r.vin),
      vin: r.vin,
      warehouse: r.organizations?.name ?? null,
      target: "銷售交車",
      outbound_date: r.sold_date ?? null,
      total_cost: cost,
      price,
      margin: price != null && cost != null ? price - cost : null,
      note: null,
    });
  }

  // ── 調撥 → TRANSFER ──
  type TransferRow = {
    id: string;
    transfer_no: string | null;
    vehicle_kind: string | null;
    new_car_id: string | null;
    used_car_id: string | null;
    from_warehouse_id: string | null;
    to_warehouse_id: string | null;
    transfer_date: string | null;
    freight_amount: unknown;
    reason: string | null;
    status: string;
  };
  for (const r of (transfers ?? []) as unknown as TransferRow[]) {
    const fromName = r.from_warehouse_id ? warehouseNames.get(r.from_warehouse_id) ?? null : null;
    const toName = r.to_warehouse_id ? warehouseNames.get(r.to_warehouse_id) ?? null : null;
    const kind: OutboundVehicleKind = r.vehicle_kind === "used" ? "USED" : "NEW";
    rows.push({
      id: `transfer:${r.id}`,
      outbound_no: r.transfer_no ?? `OUT-TR-${shortCode(r.id)}`,
      type: "TRANSFER",
      vehicle_kind: kind,
      model: r.reason ? `調撥（${r.reason}）` : "跨倉調撥",
      vin_last6: "—",
      vin: null,
      warehouse: fromName,
      target: toName ? `→ ${toName}` : "跨倉調撥",
      outbound_date: r.transfer_date ?? null,
      total_cost: null,
      price: null,
      margin: null,
      note: "調撥",
    });
  }

  // ── DEMO 試乘 / 展覽 ──
  // test_ride_bookings 表目前不存在於 schema，因此這類出庫暫為空。
  // （未來該表建立後，在此補一段 query union 進來即可。）

  // ── 排序：出庫日新到舊 ──
  rows.sort((a, b) => {
    const da = a.outbound_date ?? "";
    const db = b.outbound_date ?? "";
    return db.localeCompare(da);
  });

  // ── KPI（本月，從未過濾的完整 rows 算）──
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const isThisMonth = (r: OutboundRow) => toMonth(r.outbound_date) === thisMonth;
  const kpi: OutboundKpi = {
    totalThisMonth: rows.filter(isThisMonth).length,
    saleThisMonth: rows.filter((r) => r.type === "SALE" && isThisMonth(r)).length,
    transferThisMonth: rows.filter((r) => r.type === "TRANSFER" && isThisMonth(r)).length,
    otherThisMonth: rows.filter(
      (r) => (r.type === "DEMO" || r.type === "SCRAP") && isThisMonth(r)
    ).length,
  };

  // ── 套 filter（type / month / q）──
  let filtered = rows;
  if (filters.type) filtered = filtered.filter((r) => r.type === filters.type);
  if (filters.month) filtered = filtered.filter((r) => toMonth(r.outbound_date) === filters.month);
  if (filters.q) {
    const q = filters.q.toLowerCase();
    filtered = filtered.filter(
      (r) =>
        r.model.toLowerCase().includes(q) ||
        (r.vin?.toLowerCase().includes(q) ?? false) ||
        r.vin_last6.toLowerCase().includes(q)
    );
  }

  return { rows: filtered, kpi };
}

// ── 抓目前登入者的 brand_id（fallback 'indian'）── 跟其他整車 helper 同邏輯。
export async function getCurrentBrandId(): Promise<string> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return "indian";
  const { data } = await supabase
    .from("profile_brands")
    .select("brand_id")
    .eq("user_id", userId)
    .limit(1)
    .single();
  return data?.brand_id ?? "indian";
}
