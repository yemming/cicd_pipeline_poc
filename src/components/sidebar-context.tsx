"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type SidebarCtx = {
  collapsed: boolean;
  toggle: () => void;
  setCollapsed: (v: boolean) => void;
  fullHidden: boolean;
  setFullHidden: (v: boolean) => void;
};

const Ctx = createContext<SidebarCtx | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [fullHidden, setFullHidden] = useState(false);

  // Auto-collapse below desktop (< lg = 1024px) — covers mobile + tablet (含 iPad portrait).
  // 桌面（≥1024px）展開，平板/手機收成 14px rail，仿 Lexus 客休室「窄裝置單欄優先」策略。
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 1023px)");
    const sync = () => setCollapsed(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const toggle = useCallback(() => setCollapsed((v) => !v), []);
  const value = useMemo(
    () => ({ collapsed, toggle, setCollapsed, fullHidden, setFullHidden }),
    [collapsed, toggle, fullHidden]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSidebar(): SidebarCtx {
  return (
    useContext(Ctx) ?? {
      collapsed: false,
      toggle: () => {},
      setCollapsed: () => {},
      fullHidden: false,
      setFullHidden: () => {},
    }
  );
}
