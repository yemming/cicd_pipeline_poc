import Link from "next/link";
import { redirect } from "next/navigation";

import { DataTable } from "@/components/forms/data-table";
import { listItems } from "@/lib/master-data/queries";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import type { Warehouse } from "@/lib/parts/types";

import { CancelTransferButton } from "./_components/cancel-transfer-button";
import { NewTransferForm } from "./_components/new-transfer-form";

import { getActiveScope } from "@/lib/scope/active-scope";
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  approved: "已核准",
  shipped: "已出貨",
  in_transit: "在途",
  received: "已收貨",
  partial: "部分到貨",
  closed: "已結案",
  cancelled: "已取消",
};

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-[#DFE1E6] text-[#42526E]",
  approved: "bg-[#DEEBFF] text-[#0747A6]",
  shipped: "bg-[#FFF7E6] text-[#974F00]",
  in_transit: "bg-[#FFF7E6] text-[#974F00]",
  received: "bg-[#E3FCEF] text-[#006644]",
  partial: "bg-[#FFF7E6] text-[#974F00]",
  closed: "bg-[#E3FCEF] text-[#006644]",
  cancelled: "bg-[#DFE1E6] text-[#42526E]",
};

async function getWarehouses(): Promise<Warehouse[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("warehouses")
    .select("*")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .eq("is_active", true)
    .order("code");
  if (error) throw new Error(`getWarehouses: ${error.message}`);
  return data ?? [];
}

type TransferRow = {
  id: string;
  tr_no: string;
  status: string;
  source_warehouse_id: string;
  target_warehouse_id: string;
  qty_shipped_total: number;
  qty_received_total: number;
  ship_date: string | null;
  expected_arrival_date: string | null;
  actual_arrival_date: string | null;
  reason: string | null;
};

async function getTransfers(): Promise<TransferRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_transfers")
    .select(
      "id, tr_no, status, source_warehouse_id, target_warehouse_id, qty_shipped_total, qty_received_total, ship_date, expected_arrival_date, actual_arrival_date, reason",
    )
    .eq("brand_id", (await getActiveScope()).brand_id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`getTransfers: ${error.message}`);
  return data ?? [];
}

export default async function TransferOutPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.TRANSFER_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視調撥單的權限</p>
      </main>
    );
  }
  const canCreate = await hasPermission(PERMISSIONS.TRANSFER_CREATE);

  const [warehouses, items, transfers] = await Promise.all([
    getWarehouses(),
    listItems({ limit: 500 }),
    getTransfers(),
  ]);
  const whById = new Map(warehouses.map((w) => [w.id, w]));

  return (
    <main className="px-6 py-6 space-y-5">
      <header className="space-y-1">
        <h1 className="text-[20px] font-bold text-[#172B4D]">調撥出庫</h1>
        <p className="text-[13px] text-[#6B778C]">
          共 {transfers.length} 筆 ・ 倉間移轉，建單即出庫；目的倉收貨在「調撥入庫」處理
        </p>
      </header>

      {canCreate && <NewTransferForm warehouses={warehouses} items={items} />}

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
            key: "arrow",
            header: "→",
            width: "30px",
            cell: () => <span className="text-[#6B778C]">→</span>,
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
            key: "shipped",
            header: "出貨數",
            align: "right",
            width: "90px",
            cell: (t) => Number(t.qty_shipped_total).toLocaleString(),
          },
          {
            key: "received",
            header: "已收數",
            align: "right",
            width: "90px",
            cell: (t) => Number(t.qty_received_total).toLocaleString(),
          },
          {
            key: "ship_date",
            header: "出貨日",
            width: "100px",
            cell: (t) => t.ship_date ?? "—",
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
            width: "180px",
            cell: (t) => {
              if (t.status === "in_transit") {
                return (
                  <span className="space-x-3">
                    <Link
                      href={`/parts/receipt/transfer-in?id=${t.id}`}
                      className="text-[12px] text-[#0052CC] hover:underline"
                    >
                      去收貨
                    </Link>
                    {canCreate && (
                      <CancelTransferButton transferId={t.id} trNo={t.tr_no} />
                    )}
                  </span>
                );
              }
              return <span className="text-[#6B778C] text-[12px]">—</span>;
            },
          },
        ]}
        empty="尚無調撥單 — 點上方「新增調撥單」開始"
      />
    </main>
  );
}
