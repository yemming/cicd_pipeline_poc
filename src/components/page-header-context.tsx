"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type TopbarTab = {
  label: string;
  href?: string;
  onClick?: () => void;
  active?: boolean;
};

export type TopbarBreadcrumb = {
  label: string;
  href?: string;
};

export type PageHeaderConfig = {
  title?: string;
  tabs?: TopbarTab[];
  breadcrumb?: TopbarBreadcrumb[];
  hideSearch?: boolean;
};

type PageHeaderCtx = {
  config: PageHeaderConfig;
  setConfig: (c: PageHeaderConfig) => void;
};

const Ctx = createContext<PageHeaderCtx | null>(null);

export function PageHeaderProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<PageHeaderConfig>({});
  const value = useMemo(() => ({ config, setConfig }), [config]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePageHeader(): PageHeaderConfig {
  return useContext(Ctx)?.config ?? {};
}

export function useSetPageHeader(config: PageHeaderConfig) {
  const ctx = useContext(Ctx);
  const key = JSON.stringify(config);
  useEffect(() => {
    if (!ctx) return;
    ctx.setConfig(config);
    return () => ctx.setConfig({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
