/**
 * 新增合約 wizard — /sales/orders/new
 *
 * 保留原 RS04 wizard UI（新車 + 中古車合約書），
 * 改為寫入 DB（透過 createSalesOrderAction）。
 * 成功後 router.push 到 /sales/orders/[id]。
 */

import { Suspense } from "react";
import { getSalesOrderFormData } from "@/domain/sales-orders";
import OrderWizard from "./_components/order-wizard";

export default async function NewOrderPage() {
  const formData = await getSalesOrderFormData();

  return (
    <Suspense fallback={null}>
      <OrderWizard customers={formData.customers} vehicleModels={formData.vehicleModels} />
    </Suspense>
  );
}
