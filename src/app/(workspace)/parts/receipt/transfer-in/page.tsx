import { redirect } from "next/navigation";

import { DataTable } from "@/components/forms/data-table";
import { getBrandKey } from "@/lib/brands/current";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import type { Warehouse } from "@/lib/parts/types";

import { ReceiveTransferButton } from "./_components/receive-transfer-button";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  in_transit: "在途",
  received: "已收貨",
  partial: "部分到貨",
  closed: "已結案",
};

const STATUS_COLOR: Record<string, string> = {
  in_transit: "bg-[#FFF7E6] text-[#974F00]",
  received: "bg-[#E3FCEF] text-[#006644]",
  partial: "bg-[#FFF7E6] text-[#974F00]",
  closed: "bg-[#E3FCEF] text-[#006644]",
};

async function getInboundTransfers(): Promise<Array<{
  id: string;
  tr_no: string;
  status: string;
  source_warehouse_id: string;
  target_warehouse_id: string;
  qty_shipped_total: number;
  qty_received_total: number;
  ship_date: string | null;
  expected_arrival_date: string | null;
  reason: string | null;
}>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_transfers")
    .select(
      "id, tr_no, status, source_warehouse_id, target_warehouse_id, qty_shipped_total, qty_received_total, ship_date, expected_arrival_date, reason",
    )
    .eq("brand_id", getBrandKey())
    .in("status", ["in_transit", "partial", "received"])
    .order("ship_date", { ascending: false })
    .limit(100);
  if (error) throw new Error(`getInboundTransfers: ${error.message}`);
  return data ?? [];
}

async function getWarehouses(): Promise<Warehouse[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("warehouses")
    .select("*")
    .eq("brand_id", getBrandKey())
    .eq("is_active", true)
    .order("code");
  if (error) throw new Error(`getWarehouses: ${error.message}`);
  return data ?? [];
}

export default async function TransferInPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.RECEIPT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視收貨的權限</p>
      </main>
    );
  }
  const canReceive = await hasPermission(PERMISSIONS.RECEIPT_CREATE);

  const [transfers, warehouses] = await Promise.all([
    getInboundTransfers(),
    getWarehouses(),
  ]);
  const whById = new Map(warehouses.map((w) => [w.id, w]));

  const inTransitCount = transfers.filter((t) => t.status === "in_transit").length;

  return (
    <main className="px-6 py-6 space-y-5">
      <header className="space-y-1">
        <h1 className="text-[20px] font-bold text-[#172B4D]">調撥入庫</h1>
        <p className="text-[13px] text-[#6B778C]">
          待收 {inTransitCount} 筆 ・ 共 {transfers.length} 筆 ・ 點「確認收貨」把在途庫存翻成可用
        </p>
      </header>

      <DataTable
        rows={transfers}
        getKey={(t) => t.id}
        columns={[
          {
            key: "tr_no",
            header: "調撥單",
            width: "150px",
            cell: (t) => <span className="font-mono text-[12px]">{t.tr_no}</span>,
          },
          {
            key: "source",
            header: "來源倉",
            width: "150px",
            cell: (t) => (
              <span className="font-mono text-[12px]">
                {whById.get(t.source_warehouse_id)?.code ?? "—"}
              </span>
            ),
          },
          {
            key: "target",
            header: "目的倉",
            width: "150px",
            cell: (t) => (
              <span className="font-mono text-[12px]">
                {whById.get(t.target_warehouse_id)?.code ?? "—"}
              </span>
            ),
          },
          {
            key: "ship_date",
            header: "出貨日",
            width: "100px",
            cell: (t) => t.ship_date ?? "—",
          },
          {
            key: "qty",
            header: "數量",
            align: "right",
            width: "80px",
            cell: (t) => Number(t.qty_shipped_total).toLocaleString(),
          },
          {
            key: "status",
            header: "狀態",
            width: "90px",
            cell: (t) => (
              <span
                className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_COLOR[t.status] ?? ""}`}
              >
                {STATUS_LABEL[t.status] ?? t.status}
              </span>
            ),
          },
          {
            key: "actions",
            header: "操作",
            width: "200px",
            cell: (t) => {
              if (t.status === "in_transit" && canReceive) {
                return <ReceiveTransferButton transferId={t.id} trNo={t.tr_no} />;
              }
              return <span className="text-[#6B778C] text-[12px]">—</span>;
            },
          },
        ]}
        empty="目前沒有待收 / 已收的調撥單"
      />
    </main>
  );
}
