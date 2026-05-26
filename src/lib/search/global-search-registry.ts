/**
 * Global Search — 搜尋來源 single source of truth
 *
 * 加新 entity / 加新搜尋欄位都改這支：
 *   1. 在 SEARCH_REGISTRY 加一筆 SearchTableSpec
 *   2. UI（command-palette / topbar-search）會自動拿到 icon / color / label（透過 entity-meta.ts derive）
 *   3. /admin/global-search/registry 唯讀對照表頁會自動列出來
 *   4. /api/global-search route handler 會自動 fan-out 到這張表
 *
 * 為什麼放這裡(不放 DB)：
 *   toHit() 需要 type-safe 組 href + title + subtitle，typed function 比 DB
 *   template 安全又好維護。新增 entity 本來就是 dev change(要寫 mapper)。
 *   admin 要的是「看得到目前涵蓋哪些」可視化，已用對照表頁解決。
 */

export type GlobalSearchHit = {
  entity_type: string;
  entity_id: string;
  title: string;
  subtitle: string | null;
  href: string;
  /** 排序用；不一定回給前端,但 JSON 序列化還是會帶過去 */
  updated_at?: string | null;
};

export type SearchTableSpec = {
  /** entity_type 值(DB / API / URL 內部 key) */
  entityType: string;
  /** UI 顯示用中文 label(也是 ENTITY_META.label 的來源) */
  label: string;
  /** Material Symbols icon 名 */
  icon: string;
  /** chip / icon 配色 */
  color: string;
  /** admin 對照表頁顯示用「搜得到什麼」一句話描述 */
  description: string;
  /** 對應的 DB table */
  table: string;
  /** 要 ilike.%q% 的欄位 — 改這個就改了搜尋範圍 */
  searchFields: string[];
  /** 撈回來給 toHit 用的 select 字串 */
  selectColumns: string;
  /** 排序欄位 — 預設 updated_at;舊表(如 pos_payment_orders)沒有 updated_at 就改 created_at */
  sortColumn?: string;
  /** 主入口 / list 頁,admin 對照表用「跳去看」按鈕 */
  entryHref: string;
  /** row → GlobalSearchHit;回 null 代表這 row 不顯示 */
  toHit: (row: Record<string, unknown>) => GlobalSearchHit | null;
};

const HARD_PER_TABLE_LIMIT = 8;
const TOTAL_LIMIT = 40;

export const GLOBAL_SEARCH_LIMITS = {
  perTable: HARD_PER_TABLE_LIMIT,
  total: TOTAL_LIMIT,
};

export const SEARCH_REGISTRY: SearchTableSpec[] = [
  // ──────────────────────────────────────────────────────────────
  // 主檔類
  // ──────────────────────────────────────────────────────────────
  {
    entityType: "customer",
    label: "客戶",
    icon: "person",
    color: "#1A3A5C",
    description: "客戶代碼、姓名、電話",
    table: "customers",
    searchFields: ["code", "name", "phone"],
    selectColumns: "id, code, name, phone, updated_at",
    entryHref: "/admin/master-data/customers",
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
    entityType: "customer_contact",
    label: "聯絡人",
    icon: "contact_mail",
    color: "#185FA5",
    description: "聯絡人姓名、電話",
    table: "customer_contacts",
    searchFields: ["name", "phone"],
    selectColumns: "id, customer_id, name, phone, updated_at",
    entryHref: "/admin/master-data/customer-contacts",
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
    entityType: "customer_vehicle",
    label: "客戶車輛",
    icon: "two_wheeler",
    color: "#0F6E56",
    description: "VIN、車牌、引擎號、保單號",
    table: "customer_vehicles",
    searchFields: ["vin", "license_plate", "engine_no", "insurance_policy_no"],
    selectColumns:
      "id, customer_id, vin, license_plate, engine_no, insurance_policy_no, updated_at",
    entryHref: "/admin/master-data/customers",
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
    entityType: "employee",
    label: "員工",
    icon: "badge",
    color: "#854F0B",
    description: "員工姓名、電話",
    table: "employees",
    searchFields: ["name", "phone"],
    selectColumns: "id, name, phone, updated_at",
    entryHref: "/admin/master-data/employees",
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
    entityType: "supplier",
    label: "供應商",
    icon: "local_shipping",
    color: "#6B4FA0",
    description: "供應商代碼、名稱、電話",
    table: "suppliers",
    searchFields: ["code", "name", "phone"],
    selectColumns: "id, code, name, phone, updated_at",
    entryHref: "/admin/master-data/suppliers",
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
    entityType: "item",
    label: "商品 / 零件",
    icon: "inventory_2",
    color: "#3B6D11",
    description: "商品代碼、名稱",
    table: "items",
    searchFields: ["code", "name"],
    selectColumns: "id, code, name, updated_at",
    entryHref: "/parts/setup/items",
    toHit: (r) => ({
      entity_type: "item",
      entity_id: String(r.id),
      title: String(r.name ?? r.code ?? "(未命名商品)"),
      subtitle: (r.code as string | null) ?? null,
      href: `/parts/setup/items/${r.id}`,
      updated_at: (r.updated_at as string | null) ?? null,
    }),
  },

  // ──────────────────────────────────────────────────────────────
  // 車輛庫存類(本輪新增)
  // ──────────────────────────────────────────────────────────────
  {
    entityType: "new_car_inventory",
    label: "新車庫存",
    icon: "two_wheeler",
    color: "#0F6E56",
    description: "VIN、引擎號、車牌、車架外部編號",
    table: "new_car_inventory",
    searchFields: ["vin", "engine_no", "license_plate_no", "external_id"],
    selectColumns:
      "id, vin, engine_no, license_plate_no, color, status, updated_at",
    entryHref: "/sales/showroom/new-cars",
    toHit: (r) => ({
      entity_type: "new_car_inventory",
      entity_id: String(r.id),
      title: String(r.vin ?? r.license_plate_no ?? "(未編 VIN)"),
      subtitle:
        [
          r.engine_no && `引擎 ${r.engine_no}`,
          r.color,
          r.status,
        ]
          .filter(Boolean)
          .join(" · ") || null,
      href: `/sales/showroom/new-cars/${r.id}`,
      updated_at: (r.updated_at as string | null) ?? null,
    }),
  },
  {
    entityType: "used_car_inventory",
    label: "中古車庫存",
    icon: "two_wheeler",
    color: "#854F0B",
    description: "VIN、車牌、車型名",
    table: "used_car_inventory",
    searchFields: ["vin", "license_plate", "model_display_name"],
    selectColumns:
      "id, vin, license_plate, model_display_name, year, status, updated_at",
    entryHref: "/sales/showroom/used-cars",
    toHit: (r) => ({
      entity_type: "used_car_inventory",
      entity_id: String(r.id),
      title: String(r.model_display_name ?? r.vin ?? "(未命名中古車)"),
      subtitle:
        [
          r.year && `${r.year} 年`,
          r.vin && `VIN ${r.vin}`,
          r.license_plate,
          r.status,
        ]
          .filter(Boolean)
          .join(" · ") || null,
      href: `/sales/showroom/used-cars/${r.id}`,
      updated_at: (r.updated_at as string | null) ?? null,
    }),
  },

  // ──────────────────────────────────────────────────────────────
  // 單據類
  // ──────────────────────────────────────────────────────────────
  {
    entityType: "work_order",
    label: "服務工單",
    icon: "build",
    color: "#CC0000",
    description: "工單號(RO)、診斷文字、備註",
    table: "work_orders",
    searchFields: ["ro_no", "diagnosis", "notes"],
    selectColumns: "id, ro_no, status, updated_at",
    entryHref: "/service/workorders",
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
    entityType: "repair_order",
    label: "維修工單",
    icon: "construction",
    color: "#A22000",
    description: "維修單代碼(RO)",
    table: "repair_orders",
    searchFields: ["ro_code"],
    selectColumns: "id, ro_code, status, updated_at",
    entryHref: "/parts/aftersales/repair-orders",
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
    entityType: "sales_order",
    label: "銷售訂單",
    icon: "shopping_bag",
    color: "#CC0000",
    description: "訂單號、客戶電話、車輛 VIN / 引擎號、二手車牌",
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
    entryHref: "/sales/orders",
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
    entityType: "sales_quote",
    label: "報價單",
    icon: "request_quote",
    color: "#185FA5",
    description: "報價單號、客戶名、客戶電話",
    table: "sales_quotes",
    searchFields: ["quote_no", "customer_name", "customer_phone"],
    selectColumns:
      "id, quote_no, customer_name, customer_phone, status, updated_at",
    entryHref: "/sales/quote",
    toHit: (r) => ({
      entity_type: "sales_quote",
      entity_id: String(r.id),
      title: String(r.quote_no ?? "(未編號報價)"),
      subtitle:
        [r.customer_name, r.customer_phone, r.status]
          .filter(Boolean)
          .join(" · ") || null,
      href: `/sales/quote/${r.id}`,
      updated_at: (r.updated_at as string | null) ?? null,
    }),
  },
  {
    entityType: "purchase_order",
    label: "採購單",
    icon: "shopping_cart",
    color: "#3B6D11",
    description: "採購單號、備註",
    table: "purchase_orders",
    searchFields: ["po_no", "notes"],
    selectColumns: "id, po_no, status, updated_at",
    entryHref: "/parts/purchase/orders",
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
    entityType: "service_appointment",
    label: "服務預約",
    icon: "event",
    color: "#854F0B",
    description: "預約單號、備註",
    table: "service_appointments",
    searchFields: ["appt_no", "notes"],
    selectColumns: "id, appt_no, status, updated_at",
    entryHref: "/service/appointments",
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
    entityType: "delivery",
    label: "交車單",
    icon: "local_shipping",
    color: "#0F6E56",
    description: "交車單號、客戶名、客戶電話、車牌、PDI 工單號",
    table: "deliveries",
    searchFields: [
      "delivery_no",
      "customer_name",
      "customer_phone",
      "plate_no",
      "pdi_work_order_no",
    ],
    selectColumns:
      "id, delivery_no, customer_name, customer_phone, plate_no, status, updated_at",
    entryHref: "/sales/delivery",
    toHit: (r) => ({
      entity_type: "delivery",
      entity_id: String(r.id),
      title: String(r.delivery_no ?? "(未編號交車單)"),
      subtitle:
        [
          r.customer_name,
          r.plate_no && `車牌 ${r.plate_no}`,
          r.status,
        ]
          .filter(Boolean)
          .join(" · ") || null,
      href: "/sales/delivery",
      updated_at: (r.updated_at as string | null) ?? null,
    }),
  },
  {
    entityType: "warranty_claim",
    label: "保固索賠",
    icon: "verified_user",
    color: "#A22000",
    description: "索賠單號(CL)、原廠單號、VIN、外部 ID",
    table: "warranty_claims",
    searchFields: ["cl_no", "oem_reference_no", "vin", "external_id"],
    selectColumns: "id, cl_no, vin, status, claim_type, updated_at",
    entryHref: "/admin/master-data/warranty-claims",
    toHit: (r) => ({
      entity_type: "warranty_claim",
      entity_id: String(r.id),
      title: String(r.cl_no ?? "(未編號索賠)"),
      subtitle:
        [r.vin && `VIN ${r.vin}`, r.claim_type, r.status]
          .filter(Boolean)
          .join(" · ") || null,
      href: `/admin/master-data/warranty-claims/${r.id}`,
      updated_at: (r.updated_at as string | null) ?? null,
    }),
  },
  {
    entityType: "insurance_policy",
    label: "保單",
    icon: "shield",
    color: "#185FA5",
    description: "保單號、保險公司、備註",
    table: "insurance_policies",
    searchFields: ["policy_no", "insurer", "notes"],
    selectColumns:
      "id, policy_no, insurer, policy_type, status, updated_at",
    entryHref: "/sales/insurance",
    toHit: (r) => ({
      entity_type: "insurance_policy",
      entity_id: String(r.id),
      title: String(r.policy_no ?? "(未編號保單)"),
      subtitle:
        [r.insurer, r.policy_type, r.status]
          .filter(Boolean)
          .join(" · ") || null,
      href: "/sales/insurance",
      updated_at: (r.updated_at as string | null) ?? null,
    }),
  },

  // ──────────────────────────────────────────────────────────────
  // 庫存與發票
  // ──────────────────────────────────────────────────────────────
  {
    entityType: "stock_item",
    label: "庫存批號 / 序號",
    icon: "inventory",
    color: "#3B6D11",
    description: "序號、批號",
    table: "stock_items",
    searchFields: ["serial_no", "batch_no"],
    selectColumns: "id, serial_no, batch_no, status, updated_at",
    entryHref: "/parts/operations/balance",
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
    entityType: "stock_receipt",
    label: "進貨單",
    icon: "input",
    color: "#3B6D11",
    description: "進貨單號、備註",
    table: "stock_receipts",
    searchFields: ["gr_no", "notes"],
    selectColumns: "id, gr_no, status, updated_at",
    entryHref: "/parts/operations/receipts-history",
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
    entityType: "einvoice",
    label: "電子發票",
    icon: "receipt_long",
    color: "#185FA5",
    description: "發票號、發票防偽亂碼、買方電話",
    table: "einvoices",
    searchFields: ["ecpay_invoice_no", "ecpay_random_number", "buyer_phone"],
    selectColumns:
      "id, ecpay_invoice_no, ecpay_random_number, buyer_phone, updated_at",
    entryHref: "/einvoice",
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
    entityType: "pos_transaction",
    label: "POS 交易",
    icon: "point_of_sale",
    color: "#185FA5",
    description: "商家交易序號、綠界交易序號、商品名",
    table: "pos_payment_orders",
    searchFields: ["merchant_trade_no", "ecpay_trade_no", "item_name"],
    selectColumns:
      "merchant_trade_no, ecpay_trade_no, item_name, status, amount, created_at",
    sortColumn: "created_at",
    entryHref: "/pos/ledger",
    toHit: (r) => ({
      entity_type: "pos_transaction",
      // pos_payment_orders 主鍵就是 merchant_trade_no、不是 id
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

/** 給 UI 用：把 entityType → SearchTableSpec 做成 Map */
const BY_TYPE = new Map<string, SearchTableSpec>(
  SEARCH_REGISTRY.map((s) => [s.entityType, s]),
);

export function getSearchSpec(entityType: string): SearchTableSpec | undefined {
  return BY_TYPE.get(entityType);
}
