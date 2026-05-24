import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;
export const dynamic = "force-dynamic";

export type GlobalSearchHit = {
  entity_type: string;
  entity_id: string;
  title: string;
  subtitle: string | null;
  href: string;
  // 排序用；不一定 return 給前端，但 JSON 序列化還是會帶過去
  updated_at?: string | null;
};

// 每張表的查詢規格 — pattern 由 caller 套上去後直接丟給 PostgREST .or()
type TableSpec = {
  entity_type: string;
  table: string;
  // 用來查的欄位（會以 ilike.%q% 串成 .or()）
  searchFields: string[];
  // 撈回來給 row mapper 用的全部欄位（select 字串）
  selectColumns: string;
  // 排序欄位 — 預設 updated_at；舊表（如 pos_payment_orders）沒有 updated_at 就改 created_at
  sortColumn?: string;
  // 把 row 轉成 GlobalSearchHit；回 null 代表這 row 不要顯示
  toHit: (row: Record<string, unknown>) => GlobalSearchHit | null;
};

// 把 user input 清掉會打壞 PostgREST .or() parser 的字元（逗號、括號）
function sanitizeForOr(q: string): string {
  return q.replace(/[,()]/g, " ").trim();
}

function buildOrExpr(fields: string[], q: string): string {
  return fields.map((f) => `${f}.ilike.%${q}%`).join(",");
}

const HARD_PER_TABLE_LIMIT = 8; // 每張表最多吐這麼多，避免單一 entity 洗版
const TOTAL_LIMIT = 40;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawQ = (searchParams.get("q") ?? "").trim();
  const q = sanitizeForOr(rawQ);

  // 太短直接 short-circuit — 1 個字元 ilike 太多沒意義
  if (q.length < 2) {
    return NextResponse.json({ hits: [] satisfies GlobalSearchHit[] });
  }

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 全部表的查詢規格 — 加新 entity 在這裡疊一筆就好
  const specs: TableSpec[] = [
    {
      entity_type: "customer",
      table: "customers",
      searchFields: ["code", "name", "phone"],
      selectColumns: "id, code, name, phone, updated_at",
      toHit: (r) => ({
        entity_type: "customer",
        entity_id: String(r.id),
        title: String(r.name ?? r.code ?? "(未命名客戶)"),
        subtitle: [r.code, r.phone].filter(Boolean).join(" · ") || null,
        href: `/admin/master-data/customers/${r.id}`,
        updated_at: (r.updated_at as string | null) ?? null,
      }),
    },
    {
      entity_type: "customer_contact",
      table: "customer_contacts",
      searchFields: ["name", "phone"],
      selectColumns: "id, customer_id, name, phone, updated_at",
      toHit: (r) => ({
        entity_type: "customer_contact",
        entity_id: String(r.id),
        title: String(r.name ?? "(未命名聯絡人)"),
        subtitle: (r.phone as string | null) ?? null,
        href: r.customer_id
          ? `/admin/master-data/customers/${r.customer_id}`
          : "/admin/master-data/customer-contacts",
        updated_at: (r.updated_at as string | null) ?? null,
      }),
    },
    {
      entity_type: "customer_vehicle",
      table: "customer_vehicles",
      searchFields: ["vin", "license_plate", "engine_no", "insurance_policy_no"],
      selectColumns:
        "id, customer_id, vin, license_plate, engine_no, insurance_policy_no, updated_at",
      toHit: (r) => ({
        entity_type: "customer_vehicle",
        entity_id: String(r.id),
        title: String(r.license_plate ?? r.vin ?? "(無車牌)"),
        subtitle:
          [r.vin && `VIN ${r.vin}`, r.engine_no && `引擎 ${r.engine_no}`]
            .filter(Boolean)
            .join(" · ") || null,
        href: r.customer_id
          ? `/admin/master-data/customers/${r.customer_id}`
          : "/admin/master-data/customers",
        updated_at: (r.updated_at as string | null) ?? null,
      }),
    },
    {
      entity_type: "employee",
      table: "employees",
      searchFields: ["name", "phone"],
      selectColumns: "id, name, phone, updated_at",
      toHit: (r) => ({
        entity_type: "employee",
        entity_id: String(r.id),
        title: String(r.name ?? "(未命名員工)"),
        subtitle: (r.phone as string | null) ?? null,
        href: `/admin/master-data/employees/${r.id}`,
        updated_at: (r.updated_at as string | null) ?? null,
      }),
    },
    {
      entity_type: "supplier",
      table: "suppliers",
      searchFields: ["code", "name", "phone"],
      selectColumns: "id, code, name, phone, updated_at",
      toHit: (r) => ({
        entity_type: "supplier",
        entity_id: String(r.id),
        title: String(r.name ?? r.code ?? "(未命名供應商)"),
        subtitle: [r.code, r.phone].filter(Boolean).join(" · ") || null,
        href: `/admin/master-data/suppliers/${r.id}`,
        updated_at: (r.updated_at as string | null) ?? null,
      }),
    },
    {
      entity_type: "item",
      table: "items",
      searchFields: ["code", "name"],
      selectColumns: "id, code, name, updated_at",
      toHit: (r) => ({
        entity_type: "item",
        entity_id: String(r.id),
        title: String(r.name ?? r.code ?? "(未命名商品)"),
        subtitle: (r.code as string | null) ?? null,
        href: `/parts/setup/items/${r.id}`,
        updated_at: (r.updated_at as string | null) ?? null,
      }),
    },
    {
      entity_type: "work_order",
      table: "work_orders",
      searchFields: ["ro_no", "diagnosis", "notes"],
      selectColumns: "id, ro_no, status, updated_at",
      toHit: (r) => ({
        entity_type: "work_order",
        entity_id: String(r.id),
        title: String(r.ro_no ?? "(未編號工單)"),
        subtitle: (r.status as string | null) ?? null,
        href: "/service/workorders",
        updated_at: (r.updated_at as string | null) ?? null,
      }),
    },
    {
      entity_type: "repair_order",
      table: "repair_orders",
      searchFields: ["ro_code"],
      selectColumns: "id, ro_code, status, updated_at",
      toHit: (r) => ({
        entity_type: "repair_order",
        entity_id: String(r.id),
        title: String(r.ro_code ?? "(未編號維修單)"),
        subtitle: (r.status as string | null) ?? null,
        href: `/parts/aftersales/repair-orders/${r.id}`,
        updated_at: (r.updated_at as string | null) ?? null,
      }),
    },
    {
      entity_type: "sales_order",
      table: "sales_orders",
      searchFields: [
        "order_no",
        "customer_phone",
        "vehicle_vin",
        "vehicle_engine_no",
        "used_plate",
      ],
      selectColumns:
        "id, order_no, status, customer_phone, vehicle_vin, updated_at",
      toHit: (r) => ({
        entity_type: "sales_order",
        entity_id: String(r.id),
        title: String(r.order_no ?? "(未編號訂單)"),
        subtitle:
          [r.customer_phone, r.vehicle_vin && `VIN ${r.vehicle_vin}`]
            .filter(Boolean)
            .join(" · ") || (r.status as string | null) || null,
        href: `/sales/orders/${r.id}`,
        updated_at: (r.updated_at as string | null) ?? null,
      }),
    },
    {
      entity_type: "purchase_order",
      table: "purchase_orders",
      searchFields: ["po_no", "notes"],
      selectColumns: "id, po_no, status, updated_at",
      toHit: (r) => ({
        entity_type: "purchase_order",
        entity_id: String(r.id),
        title: String(r.po_no ?? "(未編號採購單)"),
        subtitle: (r.status as string | null) ?? null,
        href: `/parts/purchase/orders/${r.id}`,
        updated_at: (r.updated_at as string | null) ?? null,
      }),
    },
    {
      entity_type: "einvoice",
      table: "einvoices",
      searchFields: ["ecpay_invoice_no", "ecpay_random_number", "buyer_phone"],
      selectColumns:
        "id, ecpay_invoice_no, ecpay_random_number, buyer_phone, updated_at",
      toHit: (r) => ({
        entity_type: "einvoice",
        entity_id: String(r.id),
        title: String(r.ecpay_invoice_no ?? "(未開立)"),
        subtitle:
          [
            r.ecpay_random_number && `亂碼 ${r.ecpay_random_number}`,
            r.buyer_phone,
          ]
            .filter(Boolean)
            .join(" · ") || null,
        href: `/einvoice/${r.id}`,
        updated_at: (r.updated_at as string | null) ?? null,
      }),
    },
    {
      entity_type: "stock_item",
      table: "stock_items",
      searchFields: ["serial_no", "batch_no"],
      selectColumns: "id, serial_no, batch_no, status, updated_at",
      toHit: (r) => ({
        entity_type: "stock_item",
        entity_id: String(r.id),
        title: String(r.serial_no ?? r.batch_no ?? "(無編號)"),
        subtitle:
          [
            r.batch_no && r.serial_no && `批號 ${r.batch_no}`,
            r.status,
          ]
            .filter(Boolean)
            .join(" · ") || null,
        href: "/parts/operations/balance",
        updated_at: (r.updated_at as string | null) ?? null,
      }),
    },
    {
      entity_type: "stock_receipt",
      table: "stock_receipts",
      searchFields: ["gr_no", "notes"],
      selectColumns: "id, gr_no, status, updated_at",
      toHit: (r) => ({
        entity_type: "stock_receipt",
        entity_id: String(r.id),
        title: String(r.gr_no ?? "(未編號進貨)"),
        subtitle: (r.status as string | null) ?? null,
        href: "/parts/operations/receipts-history",
        updated_at: (r.updated_at as string | null) ?? null,
      }),
    },
    {
      entity_type: "service_appointment",
      table: "service_appointments",
      searchFields: ["appt_no", "notes"],
      selectColumns: "id, appt_no, status, updated_at",
      toHit: (r) => ({
        entity_type: "service_appointment",
        entity_id: String(r.id),
        title: String(r.appt_no ?? "(未編號預約)"),
        subtitle: (r.status as string | null) ?? null,
        href: `/service/appointments/${r.id}`,
        updated_at: (r.updated_at as string | null) ?? null,
      }),
    },
    {
      entity_type: "pos_transaction",
      table: "pos_payment_orders",
      searchFields: ["merchant_trade_no", "ecpay_trade_no", "item_name"],
      selectColumns:
        "merchant_trade_no, ecpay_trade_no, item_name, status, amount, created_at",
      // pos_payment_orders 沒有 updated_at 欄位，改用 created_at 排序
      sortColumn: "created_at",
      toHit: (r) => ({
        entity_type: "pos_transaction",
        // pos_payment_orders 的主鍵就是 merchant_trade_no，不是 id
        entity_id: String(r.merchant_trade_no),
        title: String(r.merchant_trade_no ?? "(未編號)"),
        subtitle:
          [r.item_name, r.amount && `NT$${r.amount}`, r.status]
            .filter(Boolean)
            .join(" · ") || null,
        href: "/pos/ledger",
        updated_at: (r.created_at as string | null) ?? null,
      }),
    },
  ];

  // 平行打所有表 — Promise.allSettled 確保任何一張表壞掉不影響其他
  const results = await Promise.allSettled(
    specs.map((spec) => runOne(supabase, spec, brand, q)),
  );

  const allHits: GlobalSearchHit[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") allHits.push(...r.value);
  }

  // 排序：updated_at desc（最近異動的優先），nullable 排後面
  allHits.sort((a, b) => {
    const at = a.updated_at ?? "";
    const bt = b.updated_at ?? "";
    if (at === bt) return 0;
    return at < bt ? 1 : -1;
  });

  return NextResponse.json({ hits: allHits.slice(0, TOTAL_LIMIT) });
}

async function runOne(
  supabase: ServerSupabase,
  spec: TableSpec,
  brand: string,
  q: string,
): Promise<GlobalSearchHit[]> {
  const orExpr = buildOrExpr(spec.searchFields, q);
  const { data, error } = await supabase
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from(spec.table as any)
    .select(spec.selectColumns)
    .eq("brand_id", brand)
    .or(orExpr)
    .order(spec.sortColumn ?? "updated_at", { ascending: false })
    .limit(HARD_PER_TABLE_LIMIT);

  if (error) {
    // 個別表壞掉就 swallow — log 在 server 端、不要讓單一表掛掉整個搜尋
    console.error(`[global-search] table=${spec.table} error:`, error.message);
    return [];
  }
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  return rows
    .map((row) => spec.toHit(row))
    .filter((h): h is GlobalSearchHit => h !== null);
}
