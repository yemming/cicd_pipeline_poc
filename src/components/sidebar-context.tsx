"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type SidebarCtx = {
  collapsed: boolean;
  toggle: () => void;
  setCollapsed: (v: boolean) => void;
  fullHidden: boolean;
  setFullHidden: (v: boolean) => void;
};

const Ctx = createContext<SidebarCtx | null>(null);

// 不做螢幕尺寸自動 collapse — 主功能表是核心 UI，永遠顯示。要隱藏走顯式互動：
// 點 active module icon 收/展 PagesPanel；點左下 chevron 進 fullHidden（縮成球）。
export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [fullHidden, setFullHidden] = useState(false);

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
