"use client";

import { useSetPageHeader } from "@/components/page-header-context";
import type { TopbarBreadcrumb, TopbarTab } from "@/components/page-header-context";
import type { ReactNode } from "react";

export function PosPageShell({
  title,
  subtitle,
  breadcrumb,
  tabs,
  actions,
  hideTitle,
  children,
  preview,
  className = "",
}: {
  title: string;
  subtitle?: string;
  breadcrumb?: TopbarBreadcrumb[];
  tabs?: TopbarTab[];
  actions?: ReactNode;
  hideTitle?: boolean;
  children: ReactNode;
  preview?: boolean;
  className?: string;
}) {
  useSetPageHeader({
    title,
    breadcrumb: breadcrumb ?? [{ label: "POS 收銀", href: "/pos" }, { label: title }],
    tabs,
  });

  return (
    <div className={`-m-8 p-8 min-h-[calc(100dvh-4rem)] bg-slate-50 ${className}`}>
      {!hideTitle && (
        <header className="mb-6 flex items-start justify-between gap-6 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-display font-extrabold text-slate-900">{title}</h1>
              {preview && (
                <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 bg-slate-200 text-slate-500 rounded">
                  Preview
                </span>
              )}
            </div>
            {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
        </header>
      )}
      {children}
    </div>
  );
}
