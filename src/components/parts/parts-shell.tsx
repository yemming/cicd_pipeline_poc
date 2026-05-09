"use client";

import { useSetPageHeader } from "@/components/page-header-context";
import type { TopbarBreadcrumb } from "@/components/page-header-context";
import type { ReactNode } from "react";

type Props = {
  title: string;
  /** 章節編號(設計稿用 4.3 / 5.1 等格式) */
  chapter?: string;
  description?: string;
  breadcrumb: TopbarBreadcrumb[];
  /** 流程關係圖,顯示在頁首下方 */
  flowSteps?: Array<{ label: string; status: "done" | "active" | "pending" }>;
  toolbarRight?: ReactNode;
  children: ReactNode;
};

/**
 * Parts 模組共用版型 — 對齊 53 HTML 設計稿視覺(navy header 已由 modern shell 提供,
 * 此元件負責頁內 flow banner / page title / toolbar / main content)。
 */
export function PartsShell({
  title,
  chapter,
  description,
  breadcrumb,
  flowSteps,
  toolbarRight,
  children,
}: Props) {
  useSetPageHeader({ breadcrumb });

  return (
    <div className="-m-4 md:-m-6 lg:-m-8 min-h-[calc(100dvh-var(--shell-topbar-h,52px))] bg-[#FAFAF9]">
      {flowSteps && flowSteps.length > 0 && (
        <div className="bg-white border-b border-[#EEECE6] px-6 py-2.5 flex items-center gap-1 text-[12px] overflow-x-auto">
          {flowSteps.map((step, i) => (
            <div key={i} className="flex items-center gap-2 shrink-0">
              {i > 0 && <span className="mx-2 text-[#D8D6CF] text-xs">→</span>}
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  step.status === "done"
                    ? "bg-[#E8F5F0] text-[#0F6E56]"
                    : step.status === "active"
                      ? "bg-[#185FA5] text-white"
                      : "bg-[#EEECE6] text-[#6B6A68]"
                }`}
              >
                {step.status === "done" ? "✓" : i + 1}
              </span>
              <span
                className={
                  step.status === "active"
                    ? "text-[#185FA5] font-semibold"
                    : step.status === "done"
                      ? "text-[#6B6A68]"
                      : "text-[#9A9890]"
                }
              >
                {step.label}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="px-6 pt-5 pb-3">
        <div className="flex items-baseline gap-2.5">
          <h1 className="text-[20px] font-bold text-[#1A1917] tracking-tight">
            {title}
          </h1>
          {chapter && (
            <span className="bg-[#F5F5F4] text-[#6B6A68] text-[11px] font-semibold px-2 py-0.5 rounded-[10px]">
              {chapter}
            </span>
          )}
        </div>
        {description && (
          <p className="text-[12px] text-[#9A9890] mt-1">{description}</p>
        )}
      </div>

      {toolbarRight && (
        <div className="px-6 pb-3 flex items-center justify-end gap-2">
          {toolbarRight}
        </div>
      )}

      <div className="px-6 pb-8">{children}</div>
    </div>
  );
}
