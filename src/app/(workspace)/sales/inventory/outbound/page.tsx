/**
 * RS_INV06 出庫管理 — 列表（純查詢頁）
 *
 * 整車供應鏈終點視角：把各來源的出庫記錄 aggregate 成統一清單。
 *   SALE 銷售出庫（new sold/delivered + used sold）
 *   TRANSFER 調撥出庫（vehicle_transfers in_transit/completed）
 *   DEMO 試乘 / 展覽（test_ride_bookings — 目前無表，空）
 *   SCRAP 報廢 / 下架（new_car damaged）
 *
 * 純讀、無 server action、無 detail page（出庫記錄是 aggregate snapshot）。
 */

import {
  listOutbound,
  getCurrentBrandId,
  type OutboundFilters,
  type OutboundType,
} from "@/domain/vehicle-outbound";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import OutboundBoard from "./_components/outbound-board";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "出庫管理 | DealerOS",
};

const VALID_TYPES: OutboundType[] = ["SALE", "TRANSFER", "DEMO", "SCRAP"];

export default async function OutboundPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; month?: string; q?: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) {
    return <main className="px-6 py-5 text-[14px] text-[#CC0000]">請先登入</main>;
  }
  if (!(await hasPermission(PERMISSIONS.SALES_ORDER_VIEW))) {
    return (
      <main className="px-6 py-5 text-[14px] text-[#CC0000]">無權限檢視出庫管理</main>
    );
  }

  const sp = await searchParams;
  const brandId = await getCurrentBrandId();
  const type = (VALID_TYPES.includes(sp.type as OutboundType) ? sp.type : "") as
    | OutboundType
    | "";

  const filters: OutboundFilters = {
    brandId,
    type,
    month: sp.month ?? "",
    q: sp.q ?? "",
  };

  const { rows, kpi } = await listOutbound(filters);

  return (
    <OutboundBoard
      rows={rows}
      kpi={kpi}
      filters={{ type, month: filters.month ?? "", q: filters.q ?? "" }}
    />
  );
}
