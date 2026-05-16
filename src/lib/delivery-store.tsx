"use client";

/**
 * Delivery cross-page store — RS05 交車管理 6 step 共用 client state
 *
 * 規格：docs/DUCATI_v2_output/01_銷售接待/02_展廳接待/RS05_交車管理_v1.html
 *
 * 範圍（6 route → 6 step）：
 *   step 1 /delivery/confirm-1       訂單覆核（交車前資料）
 *   step 2 /delivery/pdi              PDI 檢查清單（29 項）
 *   step 3 /delivery/pdi-accessories  PDI 配件安裝
 *   step 4 /delivery/confirm-2        客戶交車確認表（36 項）
 *   step 5 /delivery/warranty-sign    保固條款簽署（含三方簽名）
 *   step 6 /delivery/ceremony         完成交車 · 觸發 D+3
 *
 * key：localStorage["dealeros:delivery:v1"]
 *
 * Day 1 純前端 demo data + localStorage 持久化，不上 DB（A14 POC 階段）。
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

const STORAGE_KEY = "dealeros:delivery:v1";

export type DeliveryStepId = 1 | 2 | 3 | 4 | 5 | 6;

export type SignatureRole = "technician" | "rs" | "customer";

export type DeliveryState = {
  // 訂單覆核（從 RS04 帶下來的客戶 + 車輛資訊；demo 預填）
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerAddress: string;
  customerBirthday: string;
  vehicleModel: string;
  vehicleColor: string;
  vin: string;
  plateNo: string;
  plateDate: string;
  warrantyReceiveDate: string;
  warrantyStartDate: string;
  contractNo: string;
  rsName: string;
  deliveryDate: string;
  // step 1 訂單覆核確認
  confirmedOrder: boolean;
  // step 2 PDI 29 項
  pdiChecked: number[];
  pdiWorkOrderNo: string | null;
  // step 3 配件安裝
  accessoriesChecked: string[];
  accessoriesNote: string;
  // step 4 客戶交車確認表 36 項
  deliveryChecked: number[];
  // step 5 保固條款
  warrantyConsents: {
    promo: boolean;
    survey: boolean;
    personalize: boolean;
  };
  warrantyChecklist: number[]; // 5 項交車確認事項
  signatures: {
    technician: string | null; // ISO date
    rs: string | null;
    customer: string | null;
  };
  // step 6 完成交車
  delivered: boolean;
  deliveredAt: string | null;
};

const initialState: DeliveryState = {
  customerName: "王大明",
  customerPhone: "0912-345-678",
  customerEmail: "wang.daming@example.com",
  customerAddress: "台北市信義區市府路 1 號",
  customerBirthday: "1985-03-15",
  vehicleModel: "Panigale V4 S",
  vehicleColor: "Ducati Red",
  vin: "ZDMHA01ABCD123456",
  plateNo: "",
  plateDate: "",
  warrantyReceiveDate: "2026-06-01",
  warrantyStartDate: "2026-06-01",
  contractNo: "NC-20260510-001",
  rsName: "陳志明 RS",
  deliveryDate: "2026-06-01",
  confirmedOrder: false,
  pdiChecked: [],
  pdiWorkOrderNo: null,
  accessoriesChecked: [],
  accessoriesNote: "",
  deliveryChecked: [],
  warrantyConsents: { promo: false, survey: false, personalize: false },
  warrantyChecklist: [],
  signatures: { technician: null, rs: null, customer: null },
  delivered: false,
  deliveredAt: null,
};

type Ctx = {
  state: DeliveryState;
  patch: (partial: Partial<DeliveryState>) => void;
  togglePdi: (idx: number) => void;
  togglePdiAll: (allIdx: number[]) => void;
  toggleAccessory: (key: string) => void;
  toggleDelivery: (idx: number) => void;
  toggleDeliveryAll: (allIdx: number[]) => void;
  toggleWarrantyItem: (idx: number) => void;
  setConsent: (key: keyof DeliveryState["warrantyConsents"], v: boolean) => void;
  sign: (role: SignatureRole) => void;
  triggerPdiWorkOrder: () => void;
  confirmDelivery: () => void;
  reset: () => void;
  hydrated: boolean;
};

const DeliveryContext = createContext<Ctx | null>(null);

export function DeliveryProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DeliveryState>(initialState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<DeliveryState>;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setState((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // ignore
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore
    }
  }, [state, hydrated]);

  const patch = useCallback((partial: Partial<DeliveryState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  const togglePdi = useCallback((idx: number) => {
    setState((prev) => {
      const has = prev.pdiChecked.includes(idx);
      return {
        ...prev,
        pdiChecked: has
          ? prev.pdiChecked.filter((i) => i !== idx)
          : [...prev.pdiChecked, idx],
      };
    });
  }, []);

  const togglePdiAll = useCallback((allIdx: number[]) => {
    setState((prev) => {
      const allDone = allIdx.every((i) => prev.pdiChecked.includes(i));
      return { ...prev, pdiChecked: allDone ? [] : [...allIdx] };
    });
  }, []);

  const toggleAccessory = useCallback((key: string) => {
    setState((prev) => {
      const has = prev.accessoriesChecked.includes(key);
      return {
        ...prev,
        accessoriesChecked: has
          ? prev.accessoriesChecked.filter((k) => k !== key)
          : [...prev.accessoriesChecked, key],
      };
    });
  }, []);

  const toggleDelivery = useCallback((idx: number) => {
    setState((prev) => {
      const has = prev.deliveryChecked.includes(idx);
      return {
        ...prev,
        deliveryChecked: has
          ? prev.deliveryChecked.filter((i) => i !== idx)
          : [...prev.deliveryChecked, idx],
      };
    });
  }, []);

  const toggleDeliveryAll = useCallback((allIdx: number[]) => {
    setState((prev) => {
      const allDone = allIdx.every((i) => prev.deliveryChecked.includes(i));
      return { ...prev, deliveryChecked: allDone ? [] : [...allIdx] };
    });
  }, []);

  const toggleWarrantyItem = useCallback((idx: number) => {
    setState((prev) => {
      const has = prev.warrantyChecklist.includes(idx);
      return {
        ...prev,
        warrantyChecklist: has
          ? prev.warrantyChecklist.filter((i) => i !== idx)
          : [...prev.warrantyChecklist, idx],
      };
    });
  }, []);

  const setConsent = useCallback(
    (key: keyof DeliveryState["warrantyConsents"], v: boolean) => {
      setState((prev) => ({
        ...prev,
        warrantyConsents: { ...prev.warrantyConsents, [key]: v },
      }));
    },
    [],
  );

  const sign = useCallback((role: SignatureRole) => {
    const now = new Date().toISOString();
    setState((prev) => ({
      ...prev,
      signatures: { ...prev.signatures, [role]: now },
    }));
  }, []);

  const triggerPdiWorkOrder = useCallback(() => {
    setState((prev) => {
      if (prev.pdiWorkOrderNo) return prev;
      const stamp = new Date()
        .toISOString()
        .slice(2, 10)
        .replace(/-/g, "");
      return { ...prev, pdiWorkOrderNo: `PD-IN-${stamp}-001` };
    });
  }, []);

  const confirmDelivery = useCallback(() => {
    setState((prev) => ({
      ...prev,
      delivered: true,
      deliveredAt: new Date().toISOString(),
    }));
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
    () => ({
      state,
      patch,
      togglePdi,
      togglePdiAll,
      toggleAccessory,
      toggleDelivery,
      toggleDeliveryAll,
      toggleWarrantyItem,
      setConsent,
      sign,
      triggerPdiWorkOrder,
      confirmDelivery,
      reset,
      hydrated,
    }),
    [
      state,
      patch,
      togglePdi,
      togglePdiAll,
      toggleAccessory,
      toggleDelivery,
      toggleDeliveryAll,
      toggleWarrantyItem,
      setConsent,
      sign,
      triggerPdiWorkOrder,
      confirmDelivery,
      reset,
      hydrated,
    ],
  );

  return (
    <DeliveryContext.Provider value={value}>
      {children}
    </DeliveryContext.Provider>
  );
}

export function useDelivery() {
  const ctx = useContext(DeliveryContext);
  if (!ctx) {
    throw new Error("useDelivery must be used inside <DeliveryProvider>");
  }
  return ctx;
}
