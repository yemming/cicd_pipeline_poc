/**
 * 新增合約 wizard — /sales/orders/new
 *
 * 保留原 RS04 wizard UI（新車 + 中古車合約書），
 * 改為寫入 DB（透過 createSalesOrderAction）。
 * 成功後 router.push 到 /sales/orders/[id]。
 */

import { Suspense } from "react";
import { getSalesOrderFormData } from "@/domain/sales-orders";
import { getBrandConfig } from "@/domain/brand-config";
import { getActiveScope } from "@/lib/scope/active-scope";
import { getActiveLegalText } from "@/domain/legal-texts";
import OrderWizard from "./_components/order-wizard";

export default async function NewOrderPage() {
  const scope = await getActiveScope();
  const [formData, brandCfg, newTermsRow, usedTermsRow] = await Promise.all([
    getSalesOrderFormData(),
    getBrandConfig(scope.brand_id),
    getActiveLegalText("contract_terms_new"),
    getActiveLegalText("contract_terms_used"),
  ]);

  // 把 {brand}/{dealer} 佔位置換成實際品牌名 / 經銷商名（禁止寫死，一律走 brand_config）
  const brandName = brandCfg.brandName ?? scope.brand_id;
  const dealerName = brandCfg.dealerName ?? brandName;
  function applyBrandPlaceholder(text: string | null): string | null {
    return text
      ? text.replace(/\{brand\}/g, brandName).replace(/\{dealer\}/g, dealerName)
      : null;
  }

  return (
    <Suspense fallback={null}>
      <OrderWizard
        customers={formData.customers}
        vehicleModels={formData.vehicleModels}
        brandName={brandName}
        contractTermsNew={applyBrandPlaceholder(newTermsRow?.content ?? null)}
        contractTermsUsed={applyBrandPlaceholder(usedTermsRow?.content ?? null)}
      />
    </Suspense>
  );
}
