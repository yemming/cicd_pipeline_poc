/**
 * Demo 種子資料 — 由 Excel 七張表精煉而成
 *
 * 演示故事：
 *  - 王小明 三個月前買 Panigale V4，今天回廠保養（PI-002 進行中）
 *  - 李美玲 第二次來看 Multistrada V4（手卡 SC-002，A 級）
 *  - 林志強買的 Monster V2 上週交車（DR-001 已完成）
 *  - 兩個增項閉環 case：王小明拒絕鏈條🔴、暫緩火星塞🟢
 */

import type { DealerDB } from "./schema";

const T = (d: string) => `${d}+08:00`; // helper for ISODateTime

// ===== 員工 =====
const employees: DealerDB["employees"] = [
  { id: "emp-001", code: "S001", name: "陳大為", role: "sales",          email: "salesA@ducati.tw", active: true },
  { id: "emp-002", code: "S002", name: "黃雅婷", role: "sales",          email: "salesB@ducati.tw", active: true },
  { id: "emp-003", code: "S099", name: "蔡明達", role: "sales_manager",  email: "smgr@ducati.tw",   active: true },
  { id: "emp-004", code: "A001", name: "林志強", role: "sa",             email: "saA@ducati.tw",    active: true },
  { id: "emp-005", code: "A002", name: "周建宏", role: "sa",             email: "saB@ducati.tw",    active: true },
  { id: "emp-006", code: "T001", name: "吳俊宇", role: "technician",     active: true },
  { id: "emp-007", code: "T002", name: "鄭凱文", role: "technician",     active: true },
  { id: "emp-008", code: "T099", name: "張志明", role: "qa_lead",        email: "qa@ducati.tw",     active: true },
];

// ===== 車款 =====
const vehicle_models: DealerDB["vehicle_models"] = [
  { id: "vm-001", family: "PANIGALE",      name: "Panigale V4",       year_from: 2025, year_to: 2025, displacement_cc: 1103 },
  { id: "vm-002", family: "PANIGALE",      name: "Panigale V2",       year_from: 2025, year_to: 2025, displacement_cc: 890  },
  { id: "vm-003", family: "MULTISTRADA",   name: "Multistrada V4",    year_from: 2021, year_to: 2025, displacement_cc: 1158 },
  { id: "vm-004", family: "MULTISTRADA",   name: "Multistrada V4 RS", year_from: 2024, year_to: 2025, displacement_cc: 1158 },
  { id: "vm-005", family: "MONSTER",       name: "Monster V2",        year_from: 2021, year_to: 2025, displacement_cc: 937  },
  { id: "vm-006", family: "DIAVEL",        name: "Diavel V4",         year_from: 2023, year_to: 2025, displacement_cc: 1158 },
  { id: "vm-007", family: "STREETFIGHTER", name: "Streetfighter V4",  year_from: 2025, year_to: 2025, displacement_cc: 1103 },
  { id: "vm-008", family: "DESERTX",       name: "DesertX",           year_from: 2023, year_to: 2025, displacement_cc: 937  },
  { id: "vm-009", family: "HYPERMOTARD",   name: "Hypermotard 698",   year_from: 2024, year_to: 2025, displacement_cc: 659  },
  { id: "vm-010", family: "SCRAMBLER",     name: "Scrambler 800",     year_from: 2023, year_to: 2025, displacement_cc: 803  },
];

// ===== 保養工時表（Sheet 7 抽精選車款） =====
const service_schedules: DealerDB["service_schedules"] = [
  // Panigale V4
  { id: "ss-001", model_id: "vm-001", item_type: "first_oil_1000",     lu: 15, period_km: 1000,   period_months: null },
  { id: "ss-002", model_id: "vm-001", item_type: "annual_check",       lu: 5,  period_km: null,   period_months: 12   },
  { id: "ss-003", model_id: "vm-001", item_type: "oil_change_period",  lu: 20, period_km: 12000,  period_months: null },
  { id: "ss-004", model_id: "vm-001", item_type: "desmo",              lu: 50, period_km: 24000,  period_months: null },
  { id: "ss-005", model_id: "vm-001", item_type: "fork_oil",           lu: 15, period_km: null,   period_months: 36   },
  // Multistrada V4
  { id: "ss-010", model_id: "vm-003", item_type: "first_oil_1000",     lu: 10, period_km: 1000,   period_months: null },
  { id: "ss-011", model_id: "vm-003", item_type: "oil_change_period",  lu: 15, period_km: 15000,  period_months: 24   },
  { id: "ss-012", model_id: "vm-003", item_type: "desmo",              lu: 53, period_km: 60000,  period_months: null },
  // Monster V2
  { id: "ss-020", model_id: "vm-005", item_type: "first_oil_1000",     lu: 10, period_km: 1000,   period_months: null },
  { id: "ss-021", model_id: "vm-005", item_type: "oil_change_period",  lu: 17, period_km: 15000,  period_months: 24   },
];

// ===== 第一關環檢項目（共用 16 項） =====
const inspection_items: DealerDB["inspection_items"] = [
  { id: "ii-01", position: "車身外觀（刮傷/凹痕/龜裂）",        category: "appearance",  display_order: 1  },
  { id: "ii-02", position: "前輪胎（胎紋/胎壓/胎壁）",          category: "tire",        display_order: 2  },
  { id: "ii-03", position: "前後擋泥板/整流罩",                  category: "appearance",  display_order: 3  },
  { id: "ii-04", position: "後輪胎（胎紋/胎壓/胎壁）",          category: "tire",        display_order: 4  },
  { id: "ii-05", position: "後照鏡（完整/調整）",                category: "appearance",  display_order: 5  },
  { id: "ii-06", position: "前煞車來令片（目視）",              category: "brake",       display_order: 6  },
  { id: "ii-07", position: "燈光組（頭燈/尾燈/方向燈）",        category: "light",       display_order: 7  },
  { id: "ii-08", position: "後煞車來令片（目視）",              category: "brake",       display_order: 8  },
  { id: "ii-09", position: "儀錶板（警示燈/異常顯示）",          category: "electrical",  display_order: 9  },
  { id: "ii-10", position: "鏈條（鬆緊/潤滑/磨耗）",            category: "drivetrain",  display_order: 10 },
  { id: "ii-11", position: "把手/離合器/煞車拉桿",              category: "appearance",  display_order: 11 },
  { id: "ii-12", position: "引擎機油（目視油尺/滲漏）",          category: "engine",      display_order: 12 },
  { id: "ii-13", position: "油箱/油位",                          category: "fluid",       display_order: 13 },
  { id: "ii-14", position: "冷卻液（適用車款）",                category: "fluid",       display_order: 14 },
  { id: "ii-15", position: "車架/排氣管（滲漏/損傷）",          category: "frame",       display_order: 15 },
  { id: "ii-16", position: "電瓶外觀（腐蝕/固定）",              category: "electrical",  display_order: 16 },
];

// ===== 客戶 =====
const customers: DealerDB["customers"] = [
  {
    id: "cus-001", name: "王小明", phone: "0912-345-678", email: "ming.wang@example.com",
    birth_date: "1990-05-15", line_id: "ming0515", habc_level: "A", is_repeat: true,
    source: "首訪自然進店", created_at: T("2026-01-18T10:30:00"),
  },
  {
    id: "cus-002", name: "李美玲", phone: "0922-111-333", email: "meiling.li@example.com",
    birth_date: "1985-09-20", habc_level: "A", is_repeat: false,
    source: "Facebook 廣告", created_at: T("2026-04-15T14:20:00"),
  },
  {
    id: "cus-003", name: "林俊豪", phone: "0933-222-444",
    habc_level: "B", is_repeat: false, source: "電話預約來店",
    created_at: T("2026-04-22T11:00:00"),
  },
  {
    id: "cus-004", name: "陳建志", phone: "0955-666-888", email: "jianzhi@example.com",
    line_id: "jz_chen", habc_level: "H", is_repeat: true, source: "老客戶介紹",
    created_at: T("2025-08-10T13:45:00"),
  },
  {
    id: "cus-005", name: "吳麗珍", phone: "0966-777-999",
    habc_level: "C", is_repeat: false, source: "首訪自然進店",
    created_at: T("2026-04-25T16:10:00"),
  },
  {
    id: "cus-006", name: "黃志雄", phone: "0977-555-111", line_id: "huang_999",
    habc_level: "H", is_repeat: true, source: "Ducati Owners Club",
    created_at: T("2025-03-20T10:00:00"),
  },
];

// ===== 車輛 =====
const vehicles: DealerDB["vehicles"] = [
  {
    id: "veh-001", customer_id: "cus-001", vin: "ZDM1XBNW5MB123456", plate: "MFA-1688",
    model_id: "vm-001", color: "Ducati Red",
    mileage_km: 3850, purchase_date: "2026-01-25", warranty_start_date: "2026-01-25",
  },
  {
    id: "veh-002", customer_id: "cus-004", vin: "ZDM1XBHW8NB654321", plate: "RBE-2023",
    model_id: "vm-005", color: "Ducati Red",
    mileage_km: 8200, purchase_date: "2025-08-15", warranty_start_date: "2025-08-15",
  },
  {
    id: "veh-003", customer_id: "cus-006", vin: "ZDM1XBJX7MB789012", plate: "MNK-7777",
    model_id: "vm-003", color: "Multistrada Red",
    mileage_km: 22500, purchase_date: "2025-03-25", warranty_start_date: "2025-03-25",
  },
];

// ===== 銷售手卡 =====
const sales_cards: DealerDB["sales_cards"] = [
  {
    id: "sc-001", card_no: "RC-20260418-1430",
    customer_id: "cus-002", visited_at: T("2026-04-18T14:30:00"), left_at: T("2026-04-18T15:45:00"),
    is_first_visit: true, appointment_made: false, designated_employee_id: undefined,
    reception_employee_id: "emp-001", reception_handovers: [],
    source_channel: "Facebook 廣告",
    intent_vehicle_types: ["new"], intent_type: "first_buy",
    intent_new_model_id: "vm-003", intent_new_color: "Multistrada Red",
    purchase_timing: "this_quarter",
    competitors: [{ brand: "BMW", model: "R1300GS", price: 880000 }],
    payment_method: "loan", habc_level: "A",
    test_drive: false, quote_issued: true, order_placed: false, delivered: false,
    notes: "預算約 80 萬，下次想試駕",
  },
  {
    id: "sc-002", card_no: "RC-20260425-1610",
    customer_id: "cus-002", visited_at: T("2026-04-25T16:10:00"), left_at: T("2026-04-25T17:30:00"),
    is_first_visit: false, appointment_made: true, designated_employee_id: "emp-001",
    reception_employee_id: "emp-001", reception_handovers: [],
    source_channel: "本月再次（A 級回訪）",
    intent_vehicle_types: ["new"], intent_type: "first_buy",
    intent_new_model_id: "vm-003", intent_new_color: "Multistrada Red",
    purchase_timing: "next_month",
    competitors: [{ brand: "BMW", model: "R1300GS", price: 880000 }],
    payment_method: "loan", habc_level: "A",
    test_drive: true, quote_issued: true, order_placed: false, delivered: false,
    notes: "已完成試駕，準備談判",
  },
  {
    id: "sc-003", card_no: "RC-20260427-1100",
    customer_id: "cus-003", visited_at: T("2026-04-27T11:00:00"), left_at: T("2026-04-27T11:40:00"),
    is_first_visit: true, appointment_made: false,
    reception_employee_id: "emp-002", reception_handovers: [],
    source_channel: "首訪自然進店",
    intent_vehicle_types: ["new", "used"], intent_type: "first_buy",
    intent_new_model_id: "vm-008", intent_used_model_id: "vm-008", intent_used_in_stock: false,
    purchase_timing: "this_year",
    competitors: [], payment_method: "cash", habc_level: "B",
    test_drive: false, quote_issued: false, order_placed: false, delivered: false,
    notes: "DesertX 興趣，預算待確認",
  },
  {
    id: "sc-004", card_no: "RC-20260428-0930",
    customer_id: "cus-004", visited_at: T("2026-04-28T09:30:00"),
    is_first_visit: false, appointment_made: true, designated_employee_id: "emp-001",
    reception_employee_id: "emp-001", reception_handovers: [],
    source_channel: "老客戶回訪",
    intent_vehicle_types: ["new"], intent_type: "additional",
    intent_new_model_id: "vm-007", intent_new_color: "Ducati Red",
    purchase_timing: "this_month",
    competitors: [], payment_method: "cash", habc_level: "H",
    test_drive: true, quote_issued: true, order_placed: false, delivered: false,
    notes: "今天進店即將下訂",
  },
];

// ===== 漏斗統計（demo 當天 + 過去三天） =====
const funnel_stats: DealerDB["funnel_stats"] = [
  {
    id: "fs-001", date: "2026-04-28", scope: "store",
    reception_total: 8, showroom_visits: 6, new_leads: 3,
    test_drives: 2, quotes: 1, deals: 0, deliveries: 1,
  },
  {
    id: "fs-002", date: "2026-04-28", scope: "individual", scope_employee_id: "emp-001",
    reception_total: 4, showroom_visits: 3, new_leads: 1,
    test_drives: 2, quotes: 1, deals: 0, deliveries: 1,
  },
  {
    id: "fs-003", date: "2026-04-27", scope: "store",
    reception_total: 6, showroom_visits: 5, new_leads: 2,
    test_drives: 1, quotes: 2, deals: 1, deliveries: 0,
  },
  {
    id: "fs-004", date: "2026-04-26", scope: "store",
    reception_total: 11, showroom_visits: 9, new_leads: 5,
    test_drives: 3, quotes: 2, deals: 1, deliveries: 2,
  },
];

// ===== 預檢單 PI（demo 主角：王小明回廠保養） =====
const pre_inspections: DealerDB["pre_inspections"] = [
  {
    id: "pi-001", pi_no: "PI-20260428-001",
    vehicle_id: "veh-001",                  // 王小明 Panigale V4
    sa_employee_id: "emp-004",              // 林志強
    technician_id: "emp-006",               // 吳俊宇
    check_in_at: T("2026-04-28T09:15:00"),
    expected_pickup_at: T("2026-04-28T17:00:00"),
    mileage_km: 3850,
    status: "estimating",                   // 第四關報價中
    sa_signed_at: undefined,
    customer_signed_at: undefined,
    visit_purposes: ["定期保養", "里程保養"],
    owner_description: "煞車有點偏軟、加速時鏈條有異音",
    sa_questions: {
      "上次保養時間": "首保（2026-02-10, 1000km）",
      "異常聲響": "有，加速時鏈條",
      "操控異常": "煞車偏軟",
      "煞車感覺": "偏軟",
      "燈光電子": "正常",
      "滲漏": "無",
      "加裝意願": "考慮排氣管",
      "其他": "無",
    },
    created_at: T("2026-04-28T09:15:00"),
  },
  {
    id: "pi-002", pi_no: "PI-20260427-002",
    vehicle_id: "veh-003",                  // 黃志雄 Multistrada V4
    sa_employee_id: "emp-005",              // 周建宏
    technician_id: "emp-007",               // 鄭凱文
    ro_id: "ro-002",
    check_in_at: T("2026-04-27T10:00:00"),
    expected_pickup_at: T("2026-04-27T16:00:00"),
    mileage_km: 22500,
    status: "transferred",
    sa_signed_at: T("2026-04-27T11:30:00"),
    customer_signed_at: T("2026-04-27T11:35:00"),
    customer_signature_method: "in_person",
    visit_purposes: ["里程保養"],
    owner_description: "兩萬公里保養",
    sa_questions: {
      "上次保養時間": "15000km, 4個月前",
      "異常聲響": "無",
      "操控異常": "無",
      "煞車感覺": "正常",
      "燈光電子": "正常",
      "滲漏": "無",
      "其他": "無",
    },
    created_at: T("2026-04-27T10:00:00"),
  },
];

// ===== 第一關環檢結果（PI-001 王小明全部 16 項） =====
const pi_env_checks: DealerDB["pi_env_checks"] = [
  { id: "ec-101", pi_id: "pi-001", inspection_item_id: "ii-01", status: "ok" },
  { id: "ec-102", pi_id: "pi-001", inspection_item_id: "ii-02", status: "ok" },
  { id: "ec-103", pi_id: "pi-001", inspection_item_id: "ii-03", status: "ok" },
  { id: "ec-104", pi_id: "pi-001", inspection_item_id: "ii-04", status: "ok" },
  { id: "ec-105", pi_id: "pi-001", inspection_item_id: "ii-05", status: "ok" },
  { id: "ec-106", pi_id: "pi-001", inspection_item_id: "ii-06", status: "watch", sa_note: "厚度約 3mm，建議近期更換" },
  { id: "ec-107", pi_id: "pi-001", inspection_item_id: "ii-07", status: "ok" },
  { id: "ec-108", pi_id: "pi-001", inspection_item_id: "ii-08", status: "ok" },
  { id: "ec-109", pi_id: "pi-001", inspection_item_id: "ii-09", status: "ok" },
  { id: "ec-110", pi_id: "pi-001", inspection_item_id: "ii-10", status: "needs_repair", sa_note: "鏈條鬆動且潤滑不足" },
  { id: "ec-111", pi_id: "pi-001", inspection_item_id: "ii-11", status: "ok" },
  { id: "ec-112", pi_id: "pi-001", inspection_item_id: "ii-12", status: "ok" },
  { id: "ec-113", pi_id: "pi-001", inspection_item_id: "ii-13", status: "ok" },
  { id: "ec-114", pi_id: "pi-001", inspection_item_id: "ii-14", status: "ok" },
  { id: "ec-115", pi_id: "pi-001", inspection_item_id: "ii-15", status: "ok" },
  { id: "ec-116", pi_id: "pi-001", inspection_item_id: "ii-16", status: "ok" },
];

// ===== 第三關技師深入檢查（PI-001 王小明） =====
const pi_findings: DealerDB["pi_findings"] = [
  // 同意項目
  {
    id: "fd-101", pi_id: "pi-001",
    category: "引擎系統", item: "引擎機油及機油濾芯", diagnosis: "首保後 2850km 已達期",
    suggested_action: "更換機油 + 機油濾芯（首保後標準保養）",
    lu: 10, parts_cost: 2800, safety_level: "advisory",
    owner_decision: "agreed", decided_at: T("2026-04-28T10:30:00"),
  },
  {
    id: "fd-102", pi_id: "pi-001",
    category: "煞車系統", item: "前煞車來令片", diagnosis: "厚度 3mm（接近警戒線 2mm）",
    suggested_action: "更換前煞車來令片（建議套裝原廠版）",
    lu: 6, parts_cost: 4200, safety_level: "near_term",
    owner_decision: "agreed", decided_at: T("2026-04-28T10:32:00"),
  },
  {
    id: "fd-103", pi_id: "pi-001",
    category: "電氣系統", item: "ECU 軟體版本", diagnosis: "DDS 2.0 顯示有可用更新（NDCS 公報 2026-03）",
    suggested_action: "升級 ECU 軟體至最新版本",
    lu: 3, parts_cost: 0, safety_level: "advisory",
    owner_decision: "agreed", decided_at: T("2026-04-28T10:33:00"),
  },
  // 暫緩 → 觸發增項閉環
  {
    id: "fd-104", pi_id: "pi-001",
    category: "引擎系統", item: "火星塞", diagnosis: "外觀良好、跳火正常但已使用 3850km",
    suggested_action: "下次保養可一併更換",
    lu: 4, parts_cost: 2400, safety_level: "advisory",
    owner_decision: "deferred", decided_at: T("2026-04-28T10:34:00"),
  },
  // 拒絕 → 觸發增項閉環（🔴 安全等級）
  {
    id: "fd-105", pi_id: "pi-001",
    category: "傳動系統", item: "鏈條張力/磨耗/潤滑", diagnosis: "鬆動明顯、潤滑不足、有異音",
    suggested_action: "更換鏈條組（含前後鏈盤）",
    lu: 8, parts_cost: 6800, safety_level: "critical",
    owner_decision: "rejected", decided_at: T("2026-04-28T10:35:00"),
  },
  // 同意 — 道路測試前快檢
  {
    id: "fd-106", pi_id: "pi-001",
    category: "輪胎系統", item: "前輪胎胎壓", diagnosis: "胎壓 2.2bar（標準 2.5）",
    suggested_action: "補氣調整至 2.5bar",
    lu: 1, parts_cost: 0, safety_level: "advisory",
    owner_decision: "agreed", decided_at: T("2026-04-28T10:36:00"),
  },
];

// ===== 第四關報價（PI-001 同意項目自動彙整） =====
const labor_rate = 1650; // NTD/hr 含稅
const calcLabor = (lu: number) => Math.round((lu * 6 / 60) * labor_rate);

const pi_estimates: DealerDB["pi_estimates"] = [
  {
    id: "es-101", pi_id: "pi-001", finding_id: "fd-101",
    service_name: "更換機油 + 機油濾芯",
    lu: 10, labor_cost: calcLabor(10), parts_cost: 2800,
    subtotal: calcLabor(10) + 2800, owner_agreed: true,
  },
  {
    id: "es-102", pi_id: "pi-001", finding_id: "fd-102",
    service_name: "更換前煞車來令片",
    lu: 6, labor_cost: calcLabor(6), parts_cost: 4200,
    subtotal: calcLabor(6) + 4200, owner_agreed: true,
  },
  {
    id: "es-103", pi_id: "pi-001", finding_id: "fd-103",
    service_name: "ECU 軟體升級",
    lu: 3, labor_cost: calcLabor(3), parts_cost: 0,
    subtotal: calcLabor(3), owner_agreed: true,
  },
  {
    id: "es-104", pi_id: "pi-001", finding_id: "fd-106",
    service_name: "前輪胎壓調整",
    lu: 1, labor_cost: calcLabor(1), parts_cost: 0,
    subtotal: calcLabor(1), owner_agreed: true,
  },
];

// ===== 工單 RO（PI-002 黃志雄已轉 RO） =====
const repair_orders: DealerDB["repair_orders"] = [
  {
    id: "ro-002", ro_no: "RO-20260427-002",
    pi_id: "pi-002", vehicle_id: "veh-003",
    sa_employee_id: "emp-005", lead_technician_id: "emp-007",
    warranty_claim_type: "NA",
    status: "qa_passed",
    opened_at: T("2026-04-27T11:40:00"),
    completed_at: T("2026-04-27T15:20:00"),
    qa_signed_by: "emp-008", qa_signed_at: T("2026-04-27T15:35:00"),
    customer_signed_at: T("2026-04-27T15:50:00"),
    customer_signature_method: "in_person",
    pickup_notified_via: ["line", "sms"],
    pickup_notified_at: T("2026-04-27T15:36:00"),
    payment_method: "credit_card",
    labor_total: calcLabor(20), parts_total: 6500,
    tax: Math.round((calcLabor(20) + 6500) * 0.05),
    grand_total: Math.round((calcLabor(20) + 6500) * 1.05),
    next_service_mileage_km: 30000,
    next_service_due_date: "2026-10-27",
    notes: "Multistrada V4 兩萬公里保養 — 標準作業",
  },
];

// ===== RO 電子打卡 =====
const ro_clock_records: DealerDB["ro_clock_records"] = [
  {
    id: "cr-001", ro_id: "ro-002", technician_id: "emp-007",
    work_item: "拆裝、引擎機油 + 濾芯更換",
    started_at: T("2026-04-27T12:00:00"), ended_at: T("2026-04-27T13:30:00"),
    actual_lu: 15,
  },
  {
    id: "cr-002", ro_id: "ro-002", technician_id: "emp-007",
    work_item: "DDS 2.0 故障碼掃描 + ECU 公報執行",
    started_at: T("2026-04-27T13:45:00"), ended_at: T("2026-04-27T14:15:00"),
    actual_lu: 5,
  },
];

// ===== RO 零件 =====
const ro_parts: DealerDB["ro_parts"] = [
  { id: "rp-001", ro_id: "ro-002", part_no: "DUC-OIL-15W50", part_name: "Shell Advance 4T 15W-50", qty: 4, unit_price: 750, amount: 3000 },
  { id: "rp-002", ro_id: "ro-002", part_no: "DUC-OF-1199",   part_name: "原廠機油濾芯",              qty: 1, unit_price: 850, amount: 850 },
  { id: "rp-003", ro_id: "ro-002", part_no: "DUC-AF-V4",     part_name: "原廠空氣濾清器",            qty: 1, unit_price: 1200, amount: 1200 },
  { id: "rp-004", ro_id: "ro-002", part_no: "DUC-COOL-BLU",  part_name: "Ducati Cooling Liquid",     qty: 1, unit_price: 650, amount: 650 },
  { id: "rp-005", ro_id: "ro-002", part_no: "DUC-CHAINOIL",  part_name: "鏈條保養油",                 qty: 1, unit_price: 800, amount: 800 },
];

const ro_addon_items: DealerDB["ro_addon_items"] = [];

// ===== 增項閉環失銷追蹤（核心 IP） =====
const dropoff_cases: DealerDB["dropoff_cases"] = [
  {
    id: "do-001", case_no: "DO-20260428-001",
    source_pi_id: "pi-001", source_finding_id: "fd-105",
    customer_id: "cus-001", vehicle_id: "veh-001",
    item: "鏈條張力/磨耗/潤滑（更換鏈條組）",
    amount: 6800 + calcLabor(8),
    safety_level: "critical",
    reason: "price",
    status: "open",
    created_at: T("2026-04-28T10:35:00"),
  },
  {
    id: "do-002", case_no: "DO-20260428-002",
    source_pi_id: "pi-001", source_finding_id: "fd-104",
    customer_id: "cus-001", vehicle_id: "veh-001",
    item: "火星塞更換",
    amount: 2400 + calcLabor(4),
    safety_level: "advisory",
    reason: "no_need",
    status: "open",
    created_at: T("2026-04-28T10:34:00"),
  },
  // 歷史案例 — 已 D+3 聯繫但客戶未接
  {
    id: "do-003", case_no: "DO-20260425-001",
    source_pi_id: "pi-002", source_finding_id: "fd-105",  // 借用同 finding id 為示意
    customer_id: "cus-004", vehicle_id: "veh-002",
    item: "前輪胎更換（胎紋深度 1.8mm）",
    amount: 8500 + calcLabor(4),
    safety_level: "near_term",
    reason: "time",
    status: "d3_contacted",
    d3_contact_at: T("2026-04-28T10:00:00"),
    d3_contact_by: "emp-004",
    d3_outcome: "no_answer",
    d3_note: "電話未接通，已留 Line 訊息",
    created_at: T("2026-04-25T14:20:00"),
  },
  // 歷史案例 — 閉環成功
  {
    id: "do-004", case_no: "DO-20260415-001",
    source_pi_id: "pi-002", source_finding_id: "fd-101",
    customer_id: "cus-006", vehicle_id: "veh-003",
    item: "後避震更換",
    amount: 12000,
    safety_level: "near_term",
    reason: "price",
    status: "recovered",
    d3_contact_at: T("2026-04-18T10:00:00"),
    d3_contact_by: "emp-005",
    d3_outcome: "scheduled",
    d3_note: "客戶評估後願意預約下次回廠施工",
    closed_at: T("2026-04-27T15:50:00"),
    closure_type: "recovered",
    recovered_ro_id: "ro-002",
    created_at: T("2026-04-15T16:00:00"),
  },
];

// ===== 組裝完整 DB =====
export const initialDB: DealerDB = {
  employees,
  vehicle_models,
  service_schedules,
  inspection_items,
  customers,
  vehicles,
  sales_cards,
  funnel_stats,
  pre_inspections,
  pi_env_checks,
  pi_findings,
  pi_estimates,
  repair_orders,
  ro_clock_records,
  ro_parts,
  ro_addon_items,
  dropoff_cases,
};

// 凍結成 readonly 防止意外修改 seed
export function getInitialDB(): DealerDB {
  return JSON.parse(JSON.stringify(initialDB));
}
