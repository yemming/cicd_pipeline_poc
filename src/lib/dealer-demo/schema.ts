/**
 * Ducati DealerOS Demo — Normalized schema
 *
 * 從 Russell 的 Excel 七張表抽出的正規化 entity。
 * 設計成可以直接搬進 Supabase 當 table（snake_case 欄位、id/created_at/updated_at）。
 */

// ===== 共用型別 =====
export type ID = string;
export type ISODate = string; // 'YYYY-MM-DD'
export type ISODateTime = string; // 'YYYY-MM-DDTHH:mm:ss+08:00'

// ===== 主檔 =====

export type EmployeeRole = "sales" | "sales_manager" | "sa" | "technician" | "qa_lead" | "admin";

export interface Employee {
  id: ID;
  code: string;          // 員編 e.g. "S001"
  name: string;
  role: EmployeeRole;
  email?: string;
  phone?: string;
  active: boolean;
}

export type VehicleFamily =
  | "PANIGALE" | "STREETFIGHTER" | "MULTISTRADA" | "MONSTER"
  | "DIAVEL" | "HYPERMOTARD" | "SCRAMBLER" | "DESERTX";

export interface VehicleModel {
  id: ID;
  family: VehicleFamily;
  name: string;          // "Panigale V4"
  year_from: number;
  year_to: number;
  displacement_cc: number;
}

/** 對應 Sheet 7「定期保養內容暨工時表」 */
export type ServiceItemType =
  | "first_oil_1000"      // 首保
  | "annual_check"         // 年度保養檢查
  | "oil_change_period"    // 機油保養（每 X km）
  | "desmo"                // Desmo 保養（汽門間隙）
  | "desmo_plus_annual"    // Desmo + 年保 + 機油
  | "chain_oil"            // 無油脂複合鏈油
  | "fork_oil"             // 前叉油
  | "timing_belt";         // 正時皮帶

export interface ServiceSchedule {
  id: ID;
  model_id: ID;
  item_type: ServiceItemType;
  lu: number | null;
  period_km: number | null;     // 每 X km
  period_months: number | null; // 每 X 個月
  note?: string;
}

/** 對應預檢單第一關 16 個檢查部位 — 共用模板 */
export interface InspectionItem {
  id: ID;
  position: string;       // "車身外觀（刮傷/凹痕/龜裂）"
  category: "appearance" | "tire" | "brake" | "light" | "drivetrain" | "engine" | "fluid" | "electrical" | "frame";
  display_order: number;
}

// ===== 客戶 / 車輛 =====

export type HABCLevel = "H" | "A" | "B" | "C";

export interface Customer {
  id: ID;
  name: string;            // "王小明"
  phone: string;           // "0912-345-678"
  email?: string;
  birth_date?: ISODate;
  address?: string;
  line_id?: string;
  habc_level?: HABCLevel;  // 銷售側評級
  is_repeat: boolean;      // 是否老客戶
  source?: string;         // 首訪來源
  created_at: ISODateTime;
}

export interface Vehicle {
  id: ID;
  customer_id: ID;
  vin: string;             // 17 碼
  plate: string;           // "MFA-1234"
  model_id: ID;
  color: string;           // "Ducati Red"
  mileage_km: number;
  purchase_date: ISODate;
  warranty_start_date: ISODate;
  notes?: string;
}

// ===== 銷售側 =====

/** 對應「電子手卡 v7」 — 來客接待紀錄 */
export type IntentType = "first_buy" | "trade_in" | "additional" | "repurchase";
export type PaymentMethod = "cash" | "loan" | "lease";

export interface SalesCard {
  id: ID;
  card_no: string;            // RC-YYYYMMDD-HHMM
  customer_id: ID | null;     // 新客可能尚未建檔
  visited_at: ISODateTime;
  left_at?: ISODateTime;

  // 來客識別（橫列四欄）
  is_first_visit: boolean;
  introduced_by?: string;       // 老客戶介紹人
  appointment_made: boolean;
  designated_employee_id?: ID;

  // 接待
  reception_employee_id: ID;
  reception_handovers: { from_id: ID; to_id: ID; at: ISODateTime }[];
  source_channel: string;       // 來店管道（主管設定）

  // 購買意向
  intent_vehicle_types: ("new" | "used")[];
  intent_type: IntentType;
  intent_new_model_id?: ID;
  intent_new_color?: string;
  intent_used_model_id?: ID;
  intent_used_in_stock?: boolean;
  purchase_timing: "this_month" | "next_month" | "this_quarter" | "this_year" | "undecided";
  competitors: { brand: string; model: string; price?: number }[];
  payment_method: PaymentMethod;
  habc_level: HABCLevel;

  // 接待結果
  test_drive: boolean;
  quote_issued: boolean;
  order_placed: boolean;
  delivered: boolean;

  notes?: string;
}

/** 銷售漏斗統計（依日期/業務） */
export interface FunnelStat {
  id: ID;
  date: ISODate;
  scope: "store" | "manager" | "individual";
  scope_employee_id?: ID;
  reception_total: number;
  showroom_visits: number;
  new_leads: number;
  test_drives: number;
  quotes: number;
  deals: number;
  deliveries: number;
}

// ===== 售後｜預檢單 PI =====

export type PIStatus = "draft" | "in_progress" | "estimating" | "signed" | "transferred" | "void";

export interface PreInspection {
  id: ID;
  pi_no: string;                // PI-YYYYMMDD-NNN
  ro_id?: ID;
  vehicle_id: ID;
  sa_employee_id: ID;
  technician_id?: ID;
  check_in_at: ISODateTime;
  expected_pickup_at?: ISODateTime;
  mileage_km: number;

  status: PIStatus;
  sa_signed_at?: ISODateTime;
  customer_signed_at?: ISODateTime;
  customer_signature_method?: "in_person" | "line_screenshot" | "sms_screenshot";

  // 第二關
  visit_purposes: string[];     // ["定期保養","Desmo保養"]
  owner_description?: string;
  sa_questions: Record<string, string>; // {"上次保養":"6個月前 8000km","異常聲響":"無"} ...

  notes?: string;
  created_at: ISODateTime;
}

/** 第一關 SA 環檢結果 — 16 項逐一勾選 */
export type EnvCheckStatus = "ok" | "watch" | "needs_repair";

export interface PIEnvCheck {
  id: ID;
  pi_id: ID;
  inspection_item_id: ID;
  status: EnvCheckStatus;
  sa_note?: string;
  photo_url?: string;
}

/** 第三關技師深入檢查發現 + 第四關車主決定 */
export type SafetyLevel = "critical" | "near_term" | "advisory"; // 🔴🟡🟢
export type OwnerDecision = "agreed" | "deferred" | "rejected" | "pending";

export interface PIFinding {
  id: ID;
  pi_id: ID;
  category: string;             // "引擎系統" "煞車系統" ...
  item: string;                 // "引擎機油狀況"
  diagnosis: string;            // "需更換"
  suggested_action: string;
  lu: number;                   // 工時單位
  parts_cost: number;
  safety_level: SafetyLevel;
  owner_decision: OwnerDecision;
  decided_at?: ISODateTime;
}

/** 第四關 SA 報價彙整（從同意項目自動生成） */
export interface PIEstimate {
  id: ID;
  pi_id: ID;
  finding_id: ID;
  service_name: string;
  lu: number;
  labor_cost: number;
  parts_cost: number;
  subtotal: number;
  owner_agreed: boolean;
}

// ===== 售後｜正式工單 RO =====

export type WarrantyClaimType =
  | "PRED" | "NORM" | "ACCE" | "SPAR" | "WCRC"
  | "4EVR" | "RED1" | "RED2" | "GWIL" | "CARE" | "NA";

export type ROStatus = "opened" | "in_progress" | "completed" | "qa_passed" | "notified" | "delivered" | "closed";

export interface RepairOrder {
  id: ID;
  ro_no: string;                // RO-YYYYMMDD-NNN
  pi_id: ID;
  vehicle_id: ID;
  sa_employee_id: ID;
  lead_technician_id: ID;
  youtech_no?: string;
  warranty_claim_type: WarrantyClaimType;
  status: ROStatus;

  opened_at: ISODateTime;
  completed_at?: ISODateTime;
  qa_signed_by?: ID;
  qa_signed_at?: ISODateTime;
  customer_signed_at?: ISODateTime; // 第二次簽名
  customer_signature_method?: "in_person" | "line_screenshot" | "sms_screenshot";

  pickup_notified_via?: ("line" | "sms" | "phone")[];
  pickup_notified_at?: ISODateTime;
  delivered_at?: ISODateTime;

  payment_method?: "cash" | "credit_card" | "transfer";
  labor_total: number;
  parts_total: number;
  tax: number;
  grand_total: number;

  next_service_mileage_km?: number;
  next_service_due_date?: ISODate;
  notes?: string;
}

/** 電子打卡 — 2024 起強制 */
export interface ROClockRecord {
  id: ID;
  ro_id: ID;
  technician_id: ID;
  work_item: string;
  started_at: ISODateTime;
  ended_at?: ISODateTime;
  actual_lu?: number;
}

export interface ROPart {
  id: ID;
  ro_id: ID;
  part_no: string;
  part_name: string;
  qty: number;
  unit_price: number;
  amount: number;
  note?: string;
}

/** 維修中追加項目（第二次簽名涵蓋範圍） */
export interface ROAddonItem {
  id: ID;
  ro_id: ID;
  description: string;
  amount: number;
  added_at: ISODateTime;
  customer_confirm_method: "in_person" | "line" | "phone";
  sa_employee_id: ID;
}

// ===== 增項閉環失銷追蹤（Russell 核心 IP） =====

export type DropoffStatus =
  | "open"           // 剛建立
  | "d3_contacted"   // D+3 已聯繫
  | "d10_contacted"  // D+10 已聯繫
  | "scheduled"      // 已預約回廠
  | "recovered"      // 閉環成功
  | "lost"           // 戰敗結束（主管簽核）
  | "follow_up_30d"; // 持續跟進

export interface DropoffCase {
  id: ID;
  case_no: string;           // DO-YYYYMMDD-NNN
  source_pi_id: ID;
  source_finding_id: ID;
  customer_id: ID;
  vehicle_id: ID;
  item: string;              // 來自 PIFinding.item
  amount: number;
  safety_level: SafetyLevel;
  reason: "price" | "time" | "no_need" | "out_of_stock" | "other";
  status: DropoffStatus;

  d3_contact_at?: ISODateTime;
  d3_contact_by?: ID;
  d3_outcome?: "answered" | "no_answer" | "scheduled" | "rejected";
  d3_note?: string;

  d10_contact_at?: ISODateTime;
  d10_contact_by?: ID;
  d10_outcome?: "answered" | "no_answer" | "scheduled" | "rejected";
  d10_note?: string;

  closed_at?: ISODateTime;
  closed_by?: ID;            // 戰敗結束須售後主管簽核
  closure_type?: "recovered" | "lost";
  recovered_ro_id?: ID;      // 閉環成功時對應的下次 RO
  created_at: ISODateTime;
}

// ===== 整合 DB 形狀 =====

export interface DealerDB {
  // master
  employees: Employee[];
  vehicle_models: VehicleModel[];
  service_schedules: ServiceSchedule[];
  inspection_items: InspectionItem[];

  // customer/vehicle
  customers: Customer[];
  vehicles: Vehicle[];

  // sales
  sales_cards: SalesCard[];
  funnel_stats: FunnelStat[];

  // service - PI
  pre_inspections: PreInspection[];
  pi_env_checks: PIEnvCheck[];
  pi_findings: PIFinding[];
  pi_estimates: PIEstimate[];

  // service - RO
  repair_orders: RepairOrder[];
  ro_clock_records: ROClockRecord[];
  ro_parts: ROPart[];
  ro_addon_items: ROAddonItem[];

  // closed-loop
  dropoff_cases: DropoffCase[];
}
