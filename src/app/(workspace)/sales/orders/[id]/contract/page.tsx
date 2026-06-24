/**
 * 合約查看頁 — /sales/orders/[id]/contract
 *
 * 嵌入式頁面（在 workspace shell 內，不跳新分頁）。
 * 顯示合約全文（含快照）+ 三方簽名縮圖 + 鎖定/解鎖操作。
 * 列印沿用 /print/sales-order/[id]。
 *
 * B12 / RS04 Stage 2 (輪5-10)
 * A2：條款改走 legal_text_templates；已簽合約顯示快照內的法律文字版本。
 */

import { notFound } from "next/navigation";
import { Suspense } from "react";

import { getSalesOrderById } from "@/domain/sales-orders";
import { getActiveLegalText } from "@/domain/legal-texts";
import { getBrandConfig } from "@/domain/brand-config";
import { getActiveScope } from "@/lib/scope/active-scope";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import ContractViewer from "./_components/contract-viewer";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ContractPage({ params }: Props) {
  const { id } = await params;

  const [order, canEdit, canForfeit, canApprove, scope] = await Promise.all([
    getSalesOrderById(id),
    hasPermission(PERMISSIONS.SALES_ORDER_EDIT),
    hasPermission(PERMISSIONS.SALES_ORDER_FORFEIT),
    hasPermission(PERMISSIONS.SALES_ORDER_APPROVE),
    getActiveScope(),
  ]);

  if (!order) {
    notFound();
  }

  const canUnlock = canForfeit || canApprove;

  // 合約條款：優先讀快照（已簽合約不受後台改版影響），其次讀當前 active 版
  type ContractSnapshot = {
    legal_text?: { content: string; version: number; doc_key: string } | null;
  };
  const snap = order.metadata?.contract_snapshot as ContractSnapshot | null | undefined;
  const snapLegalText = snap?.legal_text?.content ?? null;

  // 若快照無法律文字，撈當前 active 版給顯示（並替換 {brand} 佔位）
  let liveTermsText: string | null = null;
  if (!snapLegalText) {
    const docKey = order.contract_type === "used" ? "contract_terms_used" : "contract_terms_new";
    const [legalRow, brandCfg] = await Promise.all([
      getActiveLegalText(docKey),
      getBrandConfig(scope.brand_id),
    ]);
    const brandName = brandCfg.brandName ?? scope.brand_id;
    const dealerName = brandCfg.dealerName ?? brandName;
    liveTermsText = legalRow?.content
      ? legalRow.content.replace(/\{brand\}/g, brandName).replace(/\{dealer\}/g, dealerName)
      : null;
  }

  const termsText = snapLegalText ?? liveTermsText;
  const termsFromSnapshot = !!snapLegalText;

  return (
    <Suspense fallback={null}>
      <ContractViewer
        order={order}
        canEdit={canEdit}
        canUnlock={canUnlock}
        termsText={termsText}
        termsFromSnapshot={termsFromSnapshot}
      />
    </Suspense>
  );
}
