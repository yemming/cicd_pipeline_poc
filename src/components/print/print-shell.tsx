"use client";

import type { ReactNode } from "react";
import "./print.css";

export type PrintBrand = {
  key: string;
  displayName: string;
};

export type PrintBuyer = {
  /** 公司全名（subsidiaries.legal_name） */
  legalName: string;
  taxId?: string | null;
  address?: string | null;
  phone?: string | null;
};

/**
 * 列印文件最外層 — 印表機 letterhead + 文件標題 + 單號 + 主體 slot。
 *
 * Layout（A4）：
 * ┌─────────────────────────────────┐
 * │ [公司 letterhead]   [文件標題]   │  ← 用 1.5pt 深藍線分隔
 * │ 統編 / 地址 / 電話   單號 / 日期 │
 * ├─────────────────────────────────┤
 * │ children                         │
 * └─────────────────────────────────┘
 */
export function PrintShell({
  brand,
  buyer,
  docTitle,
  docNo,
  docDate,
  children,
}: {
  brand: PrintBrand;
  buyer: PrintBuyer;
  /** 中文 + 英文標題，例：「採購單 PURCHASE ORDER」 */
  docTitle: string;
  /** 單據編號，例：PO-2026-0123 */
  docNo: string;
  /** 開立日期，傳 ISO date 即可 */
  docDate?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="print-doc">
      <header className="print-header">
        <div className="print-letterhead">
          <div className="print-brand">{brand.displayName}</div>
          <div className="print-company">{buyer.legalName}</div>
          {buyer.taxId && (
            <div className="print-meta-line">統一編號 {buyer.taxId}</div>
          )}
          {buyer.address && (
            <div className="print-meta-line">{buyer.address}</div>
          )}
          {buyer.phone && (
            <div className="print-meta-line">電話 {buyer.phone}</div>
          )}
        </div>
        <div className="print-doc-meta">
          <div className="print-doc-title">{docTitle}</div>
          <div className="print-doc-no">
            單號 <span className="print-doc-no-value">{docNo}</span>
          </div>
          {docDate && <div className="print-meta-line">日期 {docDate}</div>}
        </div>
      </header>
      <div className="print-body">{children}</div>
    </div>
  );
}
