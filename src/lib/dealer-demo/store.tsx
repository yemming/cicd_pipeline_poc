"use client";

/**
 * Ducati DealerOS Demo — Client-side in-memory store
 *
 * 用 React Context + useReducer 模擬資料庫；reset() 一鍵清回 seed。
 * 之後想接 Supabase，把 reducer 內的 mutation 換成 server action 即可，UI hook signature 不變。
 */

import { createContext, useContext, useMemo, useReducer, type ReactNode } from "react";
import type {
  DealerDB, DropoffCase, DropoffStatus, OwnerDecision, PIFinding, RepairOrder, ROStatus,
} from "./schema";
import { getInitialDB } from "./seed";

// ===== Actions =====
type Action =
  | { type: "RESET" }
  | { type: "PI_UPDATE_OWNER_DECISION"; finding_id: string; decision: OwnerDecision }
  | { type: "PI_ADD_DROPOFF_CASE"; data: DropoffCase }
  | { type: "DROPOFF_RECORD_D3"; case_id: string; outcome: NonNullable<DropoffCase["d3_outcome"]>; note?: string; by_id: string }
  | { type: "DROPOFF_RECORD_D10"; case_id: string; outcome: NonNullable<DropoffCase["d10_outcome"]>; note?: string; by_id: string }
  | { type: "DROPOFF_CLOSE"; case_id: string; closure_type: "recovered" | "lost"; by_id: string; recovered_ro_id?: string }
  | { type: "RO_UPDATE_STATUS"; ro_id: string; status: ROStatus; at?: string }
  | { type: "RO_NOTIFY_PICKUP"; ro_id: string; via: ("line" | "sms" | "phone")[]; at: string };

// ===== Reducer =====
function reducer(state: DealerDB, action: Action): DealerDB {
  switch (action.type) {
    case "RESET":
      return getInitialDB();

    case "PI_UPDATE_OWNER_DECISION":
      return {
        ...state,
        pi_findings: state.pi_findings.map((f) =>
          f.id === action.finding_id
            ? { ...f, owner_decision: action.decision, decided_at: new Date().toISOString() }
            : f
        ),
      };

    case "PI_ADD_DROPOFF_CASE":
      return { ...state, dropoff_cases: [...state.dropoff_cases, action.data] };

    case "DROPOFF_RECORD_D3":
      return {
        ...state,
        dropoff_cases: state.dropoff_cases.map((c) =>
          c.id === action.case_id
            ? {
                ...c,
                status: "d3_contacted" as DropoffStatus,
                d3_contact_at: new Date().toISOString(),
                d3_contact_by: action.by_id,
                d3_outcome: action.outcome,
                d3_note: action.note,
              }
            : c
        ),
      };

    case "DROPOFF_RECORD_D10":
      return {
        ...state,
        dropoff_cases: state.dropoff_cases.map((c) =>
          c.id === action.case_id
            ? {
                ...c,
                status: "d10_contacted" as DropoffStatus,
                d10_contact_at: new Date().toISOString(),
                d10_contact_by: action.by_id,
                d10_outcome: action.outcome,
                d10_note: action.note,
              }
            : c
        ),
      };

    case "DROPOFF_CLOSE":
      return {
        ...state,
        dropoff_cases: state.dropoff_cases.map((c) =>
          c.id === action.case_id
            ? {
                ...c,
                status: action.closure_type === "recovered" ? "recovered" : "lost",
                closed_at: new Date().toISOString(),
                closed_by: action.by_id,
                closure_type: action.closure_type,
                recovered_ro_id: action.recovered_ro_id,
              }
            : c
        ),
      };

    case "RO_UPDATE_STATUS":
      return {
        ...state,
        repair_orders: state.repair_orders.map((r) =>
          r.id === action.ro_id ? { ...r, status: action.status } : r
        ),
      };

    case "RO_NOTIFY_PICKUP":
      return {
        ...state,
        repair_orders: state.repair_orders.map((r) =>
          r.id === action.ro_id
            ? { ...r, pickup_notified_via: action.via, pickup_notified_at: action.at, status: "notified" as ROStatus }
            : r
        ),
      };

    default:
      return state;
  }
}

// ===== Context =====
interface StoreContextValue {
  db: DealerDB;
  dispatch: React.Dispatch<Action>;
}
const StoreContext = createContext<StoreContextValue | null>(null);

export function DealerDemoProvider({ children }: { children: ReactNode }) {
  const [db, dispatch] = useReducer(reducer, undefined, () => getInitialDB());
  const value = useMemo(() => ({ db, dispatch }), [db]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useDealerDB() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useDealerDB must be used inside <DealerDemoProvider>");
  return ctx;
}

// ===== 常用 selector hooks =====
export function useCustomer(id: string) {
  const { db } = useDealerDB();
  return db.customers.find((c) => c.id === id);
}

export function useVehicle(id: string) {
  const { db } = useDealerDB();
  return db.vehicles.find((v) => v.id === id);
}

export function useVehicleModel(id: string | undefined) {
  const { db } = useDealerDB();
  if (!id) return undefined;
  return db.vehicle_models.find((m) => m.id === id);
}

export function useEmployee(id: string | undefined) {
  const { db } = useDealerDB();
  if (!id) return undefined;
  return db.employees.find((e) => e.id === id);
}

export function usePIWithDetails(piId: string) {
  const { db } = useDealerDB();
  const pi = db.pre_inspections.find((p) => p.id === piId);
  if (!pi) return null;
  const vehicle = db.vehicles.find((v) => v.id === pi.vehicle_id);
  const customer = vehicle ? db.customers.find((c) => c.id === vehicle.customer_id) : undefined;
  const model = vehicle ? db.vehicle_models.find((m) => m.id === vehicle.model_id) : undefined;
  const sa = db.employees.find((e) => e.id === pi.sa_employee_id);
  const tech = pi.technician_id ? db.employees.find((e) => e.id === pi.technician_id) : undefined;
  const env_checks = db.pi_env_checks.filter((e) => e.pi_id === piId);
  const findings = db.pi_findings.filter((f) => f.pi_id === piId);
  const estimates = db.pi_estimates.filter((e) => e.pi_id === piId);
  return { pi, vehicle, customer, model, sa, tech, env_checks, findings, estimates };
}

export function useDropoffCases(opts?: { customer_id?: string; status?: DropoffStatus; safety_level?: PIFinding["safety_level"] }) {
  const { db } = useDealerDB();
  return db.dropoff_cases.filter((c) => {
    if (opts?.customer_id && c.customer_id !== opts.customer_id) return false;
    if (opts?.status && c.status !== opts.status) return false;
    if (opts?.safety_level && c.safety_level !== opts.safety_level) return false;
    return true;
  });
}

export function useROWithDetails(roId: string) {
  const { db } = useDealerDB();
  const ro = db.repair_orders.find((r) => r.id === roId);
  if (!ro) return null;
  const vehicle = db.vehicles.find((v) => v.id === ro.vehicle_id);
  const customer = vehicle ? db.customers.find((c) => c.id === vehicle.customer_id) : undefined;
  const model = vehicle ? db.vehicle_models.find((m) => m.id === vehicle.model_id) : undefined;
  const parts = db.ro_parts.filter((p) => p.ro_id === roId);
  const addons = db.ro_addon_items.filter((a) => a.ro_id === roId);
  const clocks = db.ro_clock_records.filter((c) => c.ro_id === roId);
  return { ro, vehicle, customer, model, parts, addons, clocks };
}

export function useFunnelStats(opts: { date: string; scope: "store" | "manager" | "individual"; employee_id?: string }) {
  const { db } = useDealerDB();
  return db.funnel_stats.find(
    (f) =>
      f.date === opts.date &&
      f.scope === opts.scope &&
      (opts.scope !== "individual" || f.scope_employee_id === opts.employee_id)
  );
}

// helper: 從 PI finding 自動產生 dropoff case 資料（搭配 PI_ADD_DROPOFF_CASE）
export function buildDropoffCaseFromFinding(
  finding: PIFinding,
  ctx: { customer_id: string; vehicle_id: string; reason?: DropoffCase["reason"]; labor_rate?: number }
): DropoffCase {
  const labor_rate = ctx.labor_rate ?? 1650;
  const labor = Math.round((finding.lu * 6 / 60) * labor_rate);
  const ts = new Date();
  const ymd = ts.toISOString().slice(0, 10).replace(/-/g, "");
  const seq = String(ts.getTime() % 1000).padStart(3, "0");
  return {
    id: `do-${ts.getTime()}`,
    case_no: `DO-${ymd}-${seq}`,
    source_pi_id: finding.pi_id,
    source_finding_id: finding.id,
    customer_id: ctx.customer_id,
    vehicle_id: ctx.vehicle_id,
    item: finding.item,
    amount: finding.parts_cost + labor,
    safety_level: finding.safety_level,
    reason: ctx.reason ?? "other",
    status: "open",
    created_at: ts.toISOString(),
  };
}
