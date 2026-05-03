"use client";

import { createContext, useContext, useReducer, type ReactNode } from "react";

// ── Types ────────────────────────────────────────────────
export type SafetyLevel = "critical" | "near_term" | "advisory";
export type TechDecision = "agreed" | "deferred" | "rejected";
export type DropoffStatus =
  | "open" | "d3_contacted" | "d10_contacted" | "scheduled" | "recovered" | "lost";

export interface TechItem {
  id: string;
  category: "engine" | "brake" | "tire" | "electric" | "frame";
  title: string;
  diagnosis: string;
  safetyLevel: SafetyLevel;
  decision: TechDecision;
  lu: number;       // Labor Units (1 LU = 6 min, rate NTD 165/LU)
  partsCost: number;
  partNumber: string;
  rejectReason?: string;
}

export interface SAItem {
  id: string;
  name: string;
  lu: number;
  partsCost: number;
  partNumber: string;
  deleted: boolean;
  deleteReason?: string;
}

export interface PIState {
  piNo: string;
  date: string;
  customer: { name: string; phone: string };
  vehicle: { model: string; plate: string; vin: string; mileage: number };
  purposes: string[];
  ownerDescription: string;
  saAsks: Record<string, "yes" | "no" | "na">;
  techItems: TechItem[];
  saItems: SAItem[];
  saSigned: boolean;
  customerSigned: boolean;
  transferredToRO: boolean;
  currentTab: number;
}

export interface ROState {
  roNo: string;
  sa: string;
  technician: string;
  partsIssued: boolean;
  clockIn: string;
  clockOut: string;
  techSigned: boolean;
  currentTab: number;
}

export interface InspectionState {
  checkedItems: Record<string, "ok" | "fail" | "none">;
  testAfterMileage: number;
  testItems: Record<string, boolean>;
  cleanItems: Record<string, boolean>;
  signed: boolean;
  signedAt: string;
  notifySent: boolean;
  notifySentAt: string;
  currentStep: number;
}

export interface DropoffCase {
  id: string;
  caseNo: string;
  customerName: string;
  plate: string;
  item: string;
  safetyLevel: SafetyLevel;
  amount: number;
  daysOut: number;
  status: DropoffStatus;
  d3Note?: string;
  scheduledDate?: string;
}

export interface ServiceDemoState {
  pi: PIState;
  ro: ROState;
  inspection: InspectionState;
  dropoffCases: DropoffCase[];
}

// ── Initial / seed data (Golden Demo: 王小明 × Panigale V4) ──
const LU_RATE = 165; // NTD per LU

const INITIAL_STATE: ServiceDemoState = {
  pi: {
    piNo: "PI-20260730-001",
    date: "2026-07-30",
    customer: { name: "王小明", phone: "0912-345-678" },
    vehicle: {
      model: "Ducati Panigale V4",
      plate: "ZZX-5566",
      vin: "ZDMV4E007RB000042",
      mileage: 8200,
    },
    purposes: ["里程保養", "煞車系統檢查"],
    ownerDescription: "例行 8,000km 保養，感覺前輪煞車握感變硬，拉力比之前大",
    saAsks: {
      "上次保養時間／里程": "yes",
      "異常聲響": "no",
      "操控異常": "no",
      "煞車正常": "yes",
      "燈光電子": "no",
      "滲漏": "no",
      "改裝配件需求": "na",
      "其他評估": "na",
    },
    techItems: [
      {
        id: "ti-001",
        category: "engine",
        title: "引擎機油更換",
        diagnosis: "已達 8,000km 建議換油里程，顏色偏黑，黏度下降",
        safetyLevel: "near_term",
        decision: "agreed",
        lu: 5,
        partsCost: 850,
        partNumber: "DUC-OIL-5W40",
      },
      {
        id: "ti-002",
        category: "brake",
        title: "前煞車來令片磨耗",
        diagnosis: "剩餘厚度約 1.8mm，低於安全標準 3mm，立即有失效風險",
        safetyLevel: "critical",
        decision: "agreed",
        lu: 8,
        partsCost: 2200,
        partNumber: "DUC-BRK-F01",
      },
      {
        id: "ti-003",
        category: "frame",
        title: "後鏈條鬆動",
        diagnosis: "鬆緊度超出規格範圍（超過 20mm），建議儘早調整或更換",
        safetyLevel: "near_term",
        decision: "rejected",
        lu: 6,
        partsCost: 3800,
        partNumber: "DUC-CHN-520",
        rejectReason: "車主表示下次回來再處理，目前預算有限",
      },
    ],
    saItems: [
      {
        id: "sa-001",
        name: "8,000km 定期保養套餐（機油 + 機油濾芯）",
        lu: 10,
        partsCost: 850,
        partNumber: "DUC-PKG-8K",
        deleted: false,
      },
    ],
    saSigned: false,
    customerSigned: false,
    transferredToRO: false,
    currentTab: 0,
  },
  ro: {
    roNo: "RO-20260730-001",
    sa: "林志遠",
    technician: "張偉",
    partsIssued: false,
    clockIn: "",
    clockOut: "",
    techSigned: false,
    currentTab: 0,
  },
  inspection: {
    checkedItems: {},
    testAfterMileage: 8215,
    testItems: {},
    cleanItems: {},
    signed: false,
    signedAt: "",
    notifySent: false,
    notifySentAt: "",
    currentStep: 0,
  },
  dropoffCases: [
    {
      id: "dc-001",
      caseNo: "DC-20260730-001",
      customerName: "王小明",
      plate: "ZZX-5566",
      item: "後鏈條鬆動（調整/更換）",
      safetyLevel: "near_term",
      amount: 3800,
      daysOut: 3,
      status: "open",
    },
    {
      id: "dc-002",
      caseNo: "DC-20260725-003",
      customerName: "陳大偉",
      plate: "ABX-1234",
      item: "後輪胎更換（胎紋剩餘 1.5mm）",
      safetyLevel: "critical",
      amount: 5200,
      daysOut: 8,
      status: "d3_contacted",
      d3Note: "已聯繫，車主表示下週五會來，但尚未預約",
    },
    {
      id: "dc-003",
      caseNo: "DC-20260720-007",
      customerName: "李志明",
      plate: "XYZ-9988",
      item: "電瓶老化更換",
      safetyLevel: "advisory",
      amount: 2800,
      daysOut: 13,
      status: "d10_contacted",
      d3Note: "D+3 已聯繫，車主說最近太忙",
    },
  ],
};

// ── Reducer ───────────────────────────────────────────────
type Action =
  | { type: "PI_SET_TAB"; tab: number }
  | { type: "PI_SET_TECH_DECISION"; id: string; decision: TechDecision; reason?: string }
  | { type: "PI_DELETE_SA_ITEM"; id: string; reason: string }
  | { type: "PI_SIGN_SA" }
  | { type: "PI_UNSIGN_SA" }
  | { type: "PI_SIGN_CUSTOMER" }
  | { type: "PI_UNSIGN_CUSTOMER" }
  | { type: "PI_TRANSFER_TO_RO" }
  | { type: "RO_SET_TAB"; tab: number }
  | { type: "RO_ISSUE_PARTS" }
  | { type: "RO_CLOCK_IN" }
  | { type: "RO_CLOCK_OUT" }
  | { type: "RO_TECH_SIGN" }
  | { type: "INSP_SET_STEP"; step: number }
  | { type: "INSP_CHECK_ITEM"; id: string; state: "ok" | "fail" | "none" }
  | { type: "INSP_TOGGLE_TEST"; id: string }
  | { type: "INSP_TOGGLE_CLEAN"; id: string }
  | { type: "INSP_SIGN" }
  | { type: "INSP_NOTIFY" }
  | { type: "DROPOFF_D3_CONTACT"; id: string; note: string }
  | { type: "DROPOFF_SCHEDULE"; id: string; date: string }
  | { type: "DROPOFF_RECOVER"; id: string }
  | { type: "RESET" };

function now() {
  return new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false });
}

function reducer(state: ServiceDemoState, action: Action): ServiceDemoState {
  switch (action.type) {
    case "PI_SET_TAB":
      return { ...state, pi: { ...state.pi, currentTab: action.tab } };
    case "PI_SET_TECH_DECISION":
      return {
        ...state,
        pi: {
          ...state.pi,
          techItems: state.pi.techItems.map((t) =>
            t.id === action.id
              ? { ...t, decision: action.decision, rejectReason: action.reason }
              : t
          ),
        },
      };
    case "PI_DELETE_SA_ITEM":
      return {
        ...state,
        pi: {
          ...state.pi,
          saItems: state.pi.saItems.map((s) =>
            s.id === action.id ? { ...s, deleted: true, deleteReason: action.reason } : s
          ),
        },
      };
    case "PI_SIGN_SA":
      return { ...state, pi: { ...state.pi, saSigned: true } };
    case "PI_UNSIGN_SA":
      return { ...state, pi: { ...state.pi, saSigned: false, customerSigned: false } };
    case "PI_SIGN_CUSTOMER":
      return { ...state, pi: { ...state.pi, customerSigned: true } };
    case "PI_UNSIGN_CUSTOMER":
      return { ...state, pi: { ...state.pi, customerSigned: false } };
    case "PI_TRANSFER_TO_RO":
      return { ...state, pi: { ...state.pi, transferredToRO: true } };
    case "RO_SET_TAB":
      return { ...state, ro: { ...state.ro, currentTab: action.tab } };
    case "RO_ISSUE_PARTS":
      return { ...state, ro: { ...state.ro, partsIssued: true } };
    case "RO_CLOCK_IN":
      return { ...state, ro: { ...state.ro, clockIn: now() } };
    case "RO_CLOCK_OUT":
      return { ...state, ro: { ...state.ro, clockOut: now() } };
    case "RO_TECH_SIGN":
      return { ...state, ro: { ...state.ro, techSigned: true } };
    case "INSP_SET_STEP":
      return { ...state, inspection: { ...state.inspection, currentStep: action.step } };
    case "INSP_CHECK_ITEM":
      return {
        ...state,
        inspection: {
          ...state.inspection,
          checkedItems: { ...state.inspection.checkedItems, [action.id]: action.state },
        },
      };
    case "INSP_TOGGLE_TEST":
      return {
        ...state,
        inspection: {
          ...state.inspection,
          testItems: {
            ...state.inspection.testItems,
            [action.id]: !state.inspection.testItems[action.id],
          },
        },
      };
    case "INSP_TOGGLE_CLEAN":
      return {
        ...state,
        inspection: {
          ...state.inspection,
          cleanItems: {
            ...state.inspection.cleanItems,
            [action.id]: !state.inspection.cleanItems[action.id],
          },
        },
      };
    case "INSP_SIGN":
      return {
        ...state,
        inspection: { ...state.inspection, signed: true, signedAt: now() },
      };
    case "INSP_NOTIFY":
      return {
        ...state,
        inspection: { ...state.inspection, notifySent: true, notifySentAt: now() },
      };
    case "DROPOFF_D3_CONTACT":
      return {
        ...state,
        dropoffCases: state.dropoffCases.map((c) =>
          c.id === action.id ? { ...c, status: "d3_contacted", d3Note: action.note } : c
        ),
      };
    case "DROPOFF_SCHEDULE":
      return {
        ...state,
        dropoffCases: state.dropoffCases.map((c) =>
          c.id === action.id ? { ...c, status: "scheduled", scheduledDate: action.date } : c
        ),
      };
    case "DROPOFF_RECOVER":
      return {
        ...state,
        dropoffCases: state.dropoffCases.map((c) =>
          c.id === action.id ? { ...c, status: "recovered" } : c
        ),
      };
    case "RESET":
      return INITIAL_STATE;
    default:
      return state;
  }
}

// ── Context ───────────────────────────────────────────────
const Ctx = createContext<{
  state: ServiceDemoState;
  dispatch: React.Dispatch<Action>;
  luCost: (lu: number) => number;
} | null>(null);

export function ServiceDemoProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  return (
    <Ctx.Provider value={{ state, dispatch, luCost: (lu) => lu * LU_RATE }}>
      {children}
    </Ctx.Provider>
  );
}

export function useServiceDemo() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useServiceDemo must be inside ServiceDemoProvider");
  return ctx;
}

// ── Helpers ───────────────────────────────────────────────
export const SAFETY_LABEL: Record<SafetyLevel, string> = {
  critical: "🔴 立即必修",
  near_term: "🟡 近期建議",
  advisory: "🟢 一般建議",
};

export const SAFETY_COLOR: Record<SafetyLevel, string> = {
  critical: "bg-red-100 text-red-700 border-red-300",
  near_term: "bg-amber-100 text-amber-700 border-amber-300",
  advisory: "bg-green-100 text-green-700 border-green-300",
};

export const CATEGORY_LABEL: Record<string, string> = {
  engine: "🔧 引擎系統",
  brake: "🛑 煞車系統",
  tire: "🛞 輪胎系統",
  electric: "🔌 電氣系統",
  frame: "⛓ 車架傳動",
};

export const DROPOFF_STATUS_LABEL: Record<DropoffStatus, string> = {
  open: "待 D+3 聯繫",
  d3_contacted: "D+3 已聯繫",
  d10_contacted: "D+10 已聯繫",
  scheduled: "已預約回廠",
  recovered: "✓ 閉環成功",
  lost: "戰敗結束",
};

export const DROPOFF_STATUS_COLOR: Record<DropoffStatus, string> = {
  open: "bg-red-100 text-red-700",
  d3_contacted: "bg-amber-100 text-amber-700",
  d10_contacted: "bg-orange-100 text-orange-700",
  scheduled: "bg-blue-100 text-blue-700",
  recovered: "bg-green-100 text-green-700",
  lost: "bg-neutral-200 text-neutral-500",
};
