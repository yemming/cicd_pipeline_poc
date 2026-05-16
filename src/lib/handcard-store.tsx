"use client";

/**
 * Handcard cross-page store — client-side state for v8 三 route 共用
 *
 * 提案 §3.1 決策：先做 client-side mock + localStorage 持久化，不上 DB。
 * 後續真實業務跑通 → promote 成 handcard_drafts 表。
 *
 * 範圍：
 *   - counter（STEP 0 身份 / STEP 1-2 接待）
 *   - consultant（STEP 3 HABC / STEP 4-5 跳轉 stub）
 *   - closing（STEP 6 報價 / STEP 7 標籤 / STEP 8 備註）
 *
 * key：localStorage["dealeros:handcard:v8"]
 * 重置：window.handcardReset() 或顯式 clear()
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type {
  HabcGrade,
  HandcardIdentity,
  HandcardIntent,
  HandcardTiming,
  HandcardTrialStatus,
} from "@/domain/handcard-suggestions";

const STORAGE_KEY = "dealeros:handcard:v8";

export type HandcardSelectedTag = {
  id?: string; // 來自 customer_tags / personal tags 的 id（自由格式時為 undefined）
  name: string;
  color: "red" | "yellow" | "green" | "blue";
  source: "official" | "personal" | "custom";
};

export type HandcardState = {
  // STEP 0
  identity: HandcardIdentity | null;
  // STEP 1
  customerName: string;
  customerPhone: string;
  receptionStaff: string;
  cardNo: string;
  // STEP 2
  intendedModels: string[];
  // STEP 3
  timing: HandcardTiming | null;
  intent: HandcardIntent | null;
  trialStatus: HandcardTrialStatus;
  habcGrade: HabcGrade | null;
  habcManualOverride: boolean;
  // STEP 4
  rs02WriteBack: {
    bike: string;
    startTime: string;
    duration: string;
    feedback: string;
  } | null;
  goldenMomentSeen: boolean;
  // STEP 5
  rs06WriteBack: {
    plate: string;
    estimatedPrice: number;
    note: string;
  } | null;
  // STEP 6
  quotedAmount: number | null;
  quoteRemark: string;
  // STEP 7
  tags: HandcardSelectedTag[];
  // STEP 8
  notes: string;
  competitorBrand: string;
  competitorModel: string;
};

const initialState: HandcardState = {
  identity: null,
  customerName: "",
  customerPhone: "",
  receptionStaff: "",
  cardNo: "",
  intendedModels: [],
  timing: null,
  intent: null,
  trialStatus: "none",
  habcGrade: null,
  habcManualOverride: false,
  rs02WriteBack: null,
  goldenMomentSeen: false,
  rs06WriteBack: null,
  quotedAmount: null,
  quoteRemark: "",
  tags: [],
  notes: "",
  competitorBrand: "",
  competitorModel: "",
};

type Ctx = {
  state: HandcardState;
  patch: (partial: Partial<HandcardState>) => void;
  reset: () => void;
  hydrated: boolean;
};

const HandcardContext = createContext<Ctx | null>(null);

export function HandcardProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<HandcardState>(initialState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<HandcardState>;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setState((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // ignore parse error
    }
     
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore quota error
    }
  }, [state, hydrated]);

  const patch = useCallback((partial: Partial<HandcardState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  const reset = useCallback(() => {
    setState(initialState);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo<Ctx>(
    () => ({ state, patch, reset, hydrated }),
    [state, patch, reset, hydrated],
  );

  return (
    <HandcardContext.Provider value={value}>
      {children}
    </HandcardContext.Provider>
  );
}

export function useHandcard() {
  const ctx = useContext(HandcardContext);
  if (!ctx) {
    throw new Error("useHandcard must be used inside <HandcardProvider>");
  }
  return ctx;
}
