"use server";

/**
 * Domain Helper — 售後 接待預檢（SA Pre-Inspection）
 *
 * 對應頁面：/parts/aftersales/pre-inspections（list + 5-step wizard）
 * Spec：DUCATI 售後預檢單 v2
 */

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";
import { listVehiclePendingItems } from "./service-quotes";

import type {
  CheckRow,
  DotMark,
  PreInspectionMode,
  PreInspectionStatus,
  SaQuoteItem,
  Signature,
  TechRow,
} from "./pre-inspections.constants";

export type PreInspectionMetadata = {
  dot_marks?: DotMark[];
  checks?: CheckRow[];
  purposes?: number[];
  customer_words?: string;
  asks?: Record<string, "yes" | "no" | "na">;
  sa_remark?: string;
  tech_rows?: TechRow[];
  sa_items?: SaQuoteItem[];
  sig_sa?: Signature;
  sig_customer?: Signature;
  /** RP2：雙簽後設 true，觸發環檢/基本資料唯讀 */
  sig_locked?: boolean;
  warranty_snapshot?: {
    valid?: boolean;
    started_at?: string;
    expires_at?: string;
    mileage?: string;
  };
};

export type PreInspectionRow = {
  id: string;
  brand_id: string;
  organization_id: string | null;
  pi_no: string;
  status: PreInspectionStatus;
  mode: PreInspectionMode;
  appointment_id: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  repair_order_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  vehicle_license_plate: string | null;
  vehicle_model_name: string | null;
  mileage_in: number | null;
  sa_id: string | null;
  sa_name: string | null;
  estimated_subtotal: number | null;
  estimated_labor_units: number | null;
  metadata: PreInspectionMetadata | null;
  photos: string[];
  signed_at: string | null;
  transferred_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type PreInspectionListRow = PreInspectionRow & {
  total_checks: number;
  done_checks: number;
  warning_count: number;
  damage_count: number;
};

export type PreInspectionFilters = {
  status?: PreInspectionStatus | "all";
  mode?: PreInspectionMode | "all";
  q?: string;
};

function decorate(rows: PreInspectionRow[]): PreInspectionListRow[] {
  return rows.map((r) => {
    const checks = (r.metadata?.checks ?? []) as CheckRow[];
    const total = checks.length;
    const done = checks.filter((c) => c.state >= 0).length;
    const warn = checks.filter((c) => c.state === 1).length;
    const dmg = checks.filter((c) => c.state === 2).length;
    return {
      ...r,
      photos: Array.isArray(r.photos) ? r.photos : [],
      mode: (r.mode ?? "full") as PreInspectionMode,
      total_checks: total,
      done_checks: done,
      warning_count: warn,
      damage_count: dmg,
    };
  });
}

export async function listPreInspections(
  filters: PreInspectionFilters = {},
): Promise<PreInspectionListRow[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  let query = supabase
    .from("pre_inspections")
    .select("*")
    .eq("brand_id", brand)
    .order("updated_at", { ascending: false })
    .limit(500);

  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters.mode && filters.mode !== "all") {
    query = query.eq("mode", filters.mode);
  }
  if (filters.q && filters.q.trim()) {
    const q = filters.q.trim();
    query = query.or(
      `pi_no.ilike.%${q}%,customer_name.ilike.%${q}%,vehicle_license_plate.ilike.%${q}%`,
    );
  }
  const { data, error } = await query;
  if (error) throw error;
  return decorate((data ?? []) as unknown as PreInspectionRow[]);
}

export async function getPreInspectionById(
  id: string,
): Promise<PreInspectionListRow | null> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("pre_inspections")
    .select("*")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return decorate([data as unknown as PreInspectionRow])[0] ?? null;
}

/** 撈可建立預檢的「已到店未轉預檢」appointment 候選 */
export type AppointmentCandidate = {
  id: string;
  appt_no: string;
  customer_name: string | null;
  customer_phone: string | null;
  vehicle_license_plate: string | null;
  vehicle_model_name: string | null;
  scheduled_at: string;
  status: string;
};

export async function listAppointmentCandidates(): Promise<AppointmentCandidate[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data: existed } = await supabase
    .from("pre_inspections")
    .select("appointment_id")
    .eq("brand_id", brand)
    .not("appointment_id", "is", null);
  const exclude = new Set(
    ((existed ?? []) as { appointment_id: string }[]).map((r) => r.appointment_id),
  );

  // 讀售後預約看板活表 appointments（非 master-data 殘表 service_appointments）。
  // 候選 = 已到店 / 待到店且尚未轉預檢（exclude set 排掉已有 PI 的）。
  const { data, error } = await supabase
    .from("appointments")
    .select("id, customer_id, vehicle_id, appointment_date, appointment_time, status")
    .eq("brand_id", brand)
    .in("status", ["待到廠", "已到廠"])
    .order("appointment_date", { ascending: false })
    .limit(50);
  if (error) throw error;
  const apps = (data ?? []).filter((a) => !exclude.has(a.id));
  if (apps.length === 0) return [];

  const customerIds = Array.from(
    new Set(apps.map((a) => a.customer_id).filter(Boolean) as string[]),
  );
  const vehicleIds = Array.from(
    new Set(apps.map((a) => a.vehicle_id).filter(Boolean) as string[]),
  );

  const [custRes, vehRes] = await Promise.all([
    customerIds.length
      ? supabase
          .from("customers")
          .select("id, name, phone")
          .eq("brand_id", brand)
          .in("id", customerIds)
      : Promise.resolve({ data: [] as { id: string; name: string; phone: string | null }[] }),
    vehicleIds.length
      ? supabase
          .from("customer_vehicles")
          .select("id, license_plate, vehicle_models(display_name, model_name)")
          .in("id", vehicleIds)
      : Promise.resolve({
          data: [] as Array<{
            id: string;
            license_plate: string;
            vehicle_models:
              | { display_name?: string | null; model_name?: string | null }
              | { display_name?: string | null; model_name?: string | null }[]
              | null;
          }>,
        }),
  ]);
  const custMap = new Map(
    ((custRes.data ?? []) as { id: string; name: string; phone: string | null }[]).map((c) => [
      c.id,
      { name: c.name, phone: c.phone },
    ]),
  );
  const vehMap = new Map(
    ((vehRes.data ?? []) as Array<{
      id: string;
      license_plate: string;
      vehicle_models:
        | { display_name?: string | null; model_name?: string | null }
        | { display_name?: string | null; model_name?: string | null }[]
        | null;
    }>).map((v) => {
      const m = Array.isArray(v.vehicle_models) ? v.vehicle_models[0] : v.vehicle_models;
      return [
        v.id,
        {
          license_plate: v.license_plate,
          model: m?.display_name ?? m?.model_name ?? null,
        },
      ] as const;
    }),
  );

  return apps.map((a) => ({
    id: a.id,
    // appointments 無 appt_no → 用日期當人讀參考
    appt_no: a.appointment_date ?? a.id.slice(0, 8),
    customer_name: a.customer_id ? custMap.get(a.customer_id)?.name ?? null : null,
    customer_phone: a.customer_id ? custMap.get(a.customer_id)?.phone ?? null : null,
    vehicle_license_plate: a.vehicle_id ? vehMap.get(a.vehicle_id)?.license_plate ?? null : null,
    vehicle_model_name: a.vehicle_id ? vehMap.get(a.vehicle_id)?.model ?? null : null,
    scheduled_at: `${a.appointment_date ?? ""}${a.appointment_time ? " " + a.appointment_time : ""}`,
    status: a.status,
  }));
}

// ───────────────────────────────────────────────────────────
// 包D：接待預檢「車牌查詢」— 輸入車牌帶出車主 / 車型 / 待處理項 / 特殊標籤
//  - found=false → UI 引導去建檔
//  - pending_items：上次拒絕的追加項（vehicle_pending_items）下次帶出提醒
//  - special_tags：客戶 metadata.tags + customer_type(VIP/黑名單) + 車輛 metadata.special_tags
// ───────────────────────────────────────────────────────────
export type PlateLookupResult = {
  found: boolean;
  vehicle: {
    id: string;
    license_plate: string | null;
    model_name: string | null;
    current_mileage: number | null;
    /** RP7 B4-01：保固到期日 — 優先用 customer_vehicles.warranty_until（交車日+保固月推算），
     *  若無則嘗試從 metadata.warranty_started_at + warranty_months 計算，仍無才為 null */
    warranty_until: string | null;
    /** RP7：保固到期是否由系統自動推算（true = 可舉證；false/null = 人工字串或未設） */
    warranty_computed: boolean;
  } | null;
  customer: { id: string; name: string | null; phone: string | null } | null;
  /** RP7 擴充：含 safety_level / reject_count */
  pending_items: {
    id: string;
    item_desc: string;
    reason: string | null;
    created_at: string;
    safety_level: string;
    reject_count: number;
  }[];
  special_tags: string[];
};

function deriveSpecialTags(
  customerType: string | null,
  custMeta: Record<string, unknown>,
  vehMeta: Record<string, unknown>,
): string[] {
  const tags = new Set<string>();
  // 客戶分級：VIP / 黑名單 視為特殊
  if (customerType && /vip|黑名單|blacklist|重點|重要/i.test(customerType)) {
    tags.add(customerType);
  }
  const collect = (v: unknown) => {
    if (Array.isArray(v)) v.forEach((x) => typeof x === "string" && tags.add(x));
    else if (typeof v === "string" && v.trim()) tags.add(v.trim());
  };
  collect(custMeta.tags);
  collect(custMeta.special_tags);
  collect((custMeta as { flags?: unknown }).flags);
  collect(vehMeta.special_tags);
  collect(vehMeta.tags);
  if (vehMeta.is_special === true) tags.add("特殊車輛");
  return Array.from(tags);
}

/** RP7 B4-01：從 metadata 計算保固到期（metadata.warranty_started_at + warranty_months）
 *  — 當 customer_vehicles.warranty_until 為 null 時的 fallback。
 *  warranty_started_at 由 startVehicleWarranty (sales-orders.ts hook#3) 寫入。
 */
function computeWarrantyUntilFromMeta(meta: Record<string, unknown> | null): string | null {
  if (!meta) return null;
  const started = meta.warranty_started_at;
  const months = meta.warranty_months;
  if (typeof started !== "string" || !started) return null;
  const m = typeof months === "number" ? months : 24;
  const [y, mo, d] = started.split("-").map((v) => parseInt(v, 10));
  if (!y || !mo) return null;
  const base = new Date(Date.UTC(y, mo - 1, d || 1));
  base.setUTCMonth(base.getUTCMonth() + m);
  return base.toISOString().slice(0, 10);
}

export async function lookupVehicleByPlate(
  plate: string,
): Promise<PlateLookupResult> {
  const empty: PlateLookupResult = {
    found: false,
    vehicle: null,
    customer: null,
    pending_items: [],
    special_tags: [],
  };
  const trimmed = plate.trim();
  if (!trimmed) return empty;

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data: veh } = await supabase
    .from("customer_vehicles")
    .select(
      "id, license_plate, current_mileage, warranty_until, customer_id, metadata, vehicle_models(display_name, model_name)",
    )
    .eq("brand_id", brand)
    .ilike("license_plate", trimmed)
    .limit(1)
    .maybeSingle();
  if (!veh) return empty;

  const v = veh as {
    id: string;
    license_plate: string | null;
    current_mileage: number | null;
    warranty_until: string | null;
    customer_id: string | null;
    metadata: Record<string, unknown> | null;
    vehicle_models: { display_name?: string; model_name?: string } | { display_name?: string; model_name?: string }[] | null;
  };
  const m = Array.isArray(v.vehicle_models) ? v.vehicle_models[0] : v.vehicle_models;

  // RP7 B4-01：保固到期推算
  // 優先用 typed 欄位 warranty_until（startVehicleWarranty 交車時自動寫入）；
  // 若為 null 則 fallback 到 metadata.warranty_started_at + warranty_months
  const warrantyFromTyped = v.warranty_until;
  const warrantyFromMeta = computeWarrantyUntilFromMeta(v.metadata);
  const finalWarrantyUntil = warrantyFromTyped ?? warrantyFromMeta;
  // warranty_computed=true 表示系統自動推算（非人工字串），可舉證
  const warrantyComputed = warrantyFromTyped != null || warrantyFromMeta != null;

  let customer: PlateLookupResult["customer"] = null;
  let customerType: string | null = null;
  let custMeta: Record<string, unknown> = {};
  if (v.customer_id) {
    const { data: c } = await supabase
      .from("customers")
      .select("id, name, phone, customer_type, metadata")
      .eq("id", v.customer_id)
      .maybeSingle();
    if (c) {
      const cc = c as {
        id: string;
        name: string | null;
        phone: string | null;
        customer_type: string | null;
        metadata: Record<string, unknown> | null;
      };
      customer = { id: cc.id, name: cc.name, phone: cc.phone };
      customerType = cc.customer_type;
      custMeta = cc.metadata ?? {};
    }
  }

  const pending = await listVehiclePendingItems(brand, v.id);

  return {
    found: true,
    vehicle: {
      id: v.id,
      license_plate: v.license_plate,
      model_name: m?.display_name ?? m?.model_name ?? null,
      current_mileage: v.current_mileage,
      warranty_until: finalWarrantyUntil,
      warranty_computed: warrantyComputed,
    },
    customer,
    pending_items: pending.map((p) => ({
      id: p.id,
      item_desc: p.itemDesc,
      reason: p.reason,
      created_at: p.createdAt,
      safety_level: p.safetyLevel,
      reject_count: p.rejectCount,
    })),
    special_tags: deriveSpecialTags(customerType, custMeta, v.metadata ?? {}),
  };
}
