import Link from "next/link";
import { redirect } from "next/navigation";

import { DataTable } from "@/components/forms/data-table";
import { getBrandKey } from "@/lib/brands/current";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import type { Warehouse } from "@/lib/parts/types";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  tr_no: string;
  source_warehouse_id: string;
  target_warehouse_id: string;
  qty_shipped_total: number;
  ship_date: string | null;
  expected_arrival_date: string | null;
  logistics_provider: string | null;
  logistics_tracking_no: string | null;
  reason: string | null;
};

async function getInTransit(): Promise<Row[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_transfers")
    .select(
      "id, tr_no, source_warehouse_id, target_warehouse_id, qty_shipped_total, ship_date, expected_arrival_date, logistics_provider, logistics_tracking_no, reason",
    )
    .eq("brand_id", getBrandKey())
    .eq("status", "in_transit")
    .order("ship_date", { ascending: false })
    .limit(100);
  if (error) throw new Error(`getInTransit: ${error.message}`);
  return data ?? [];
}

async function getWarehouses(): Promise<Warehouse[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("warehouses")
    .select("*")
    .eq("brand_id", getBrandKey())
    .eq("is_active", true);
  if (error) throw new Error(`getWarehouses: ${error.message}`);
  return data ?? [];
}

export default async function TransfersInTransitPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.TRANSFER_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視調撥的權限</p>
      </main>
    );
  }

  const [rows, warehouses] = await Promise.all([getInTransit(), getWarehouses()]);
  const whById = new Map(warehouses.map((w) => [w.id, w]));

  const totalQty = rows.reduce((s, r) => s + Number(r.qty_shipped_total), 0);

  return (
    <main className="px-6 py-6 space-y-5">
      <header className="space-y-1">
        <h1 className="text-[20px] font-bold text-[#172B4D]">調撥在途查詢</h1>
        <p className="text-[13px] text-[#6B778C]">
          共 {rows.length} 筆 in_transit ・ 在途總數 {totalQty.toLocaleString()} 件 ・
          收貨請至{" "}
          <Link href="/parts/receipt/transfer-in" className="text-[#0052CC] hover:underline">
            調撥入庫
          </Link>
        </p>
      </header>

      <DataTable
        rows={rows}
        getKey={(r) => r.id}
        columns={[
          {
            key: "tr_no",
            header: "調撥單",
            width: "150px",
            cell: (r) => <span className="font-mono text-[12px]">{r.tr_no}</span>,
          },
          {
            key: "route",
            header: "路徑",
            cell: (r) => (
              <span className="text-[12px]">
                <span className="font-mono">
                  {whById.get(r.source_warehouse_id)?.code ?? "—"}
                </span>
                <span className="mx-2 text-[#6B778C]">→</span>
                <span className="font-mono">
                  {whById.get(r.target_warehouse_id)?.code ?? "—"}
                </span>
              </span>
            ),
          },
          {
            key: "qty",
            header: "件數",
            align: "right",
            width: "80px",
            cell: (r) => Number(r.qty_shipped_total).toLocaleString(),
          },
          {
            key: "ship_date",
            header: "出貨日",
            width: "100px",
            cell: (r) => r.ship_date ?? "—",
          },
          {
            key: "eta",
            header: "預估到貨",
            width: "100px",
            cell: (r) =>
              r.expected_arrival_date ?? <span className="text-[#6B778C]">—</span>,
          },
          {
            key: "logistics",
            header: "物流",
            cell: (r) =>
              r.logistics_provider ? (
                <span className="text-[12px]">
                  {r.logistics_provider}
                  {r.logistics_tracking_no && (
                    <span className="ml-1 font-mono text-[#6B778C]">
                      {r.logistics_tracking_no}
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-[#6B778C]">—</span>
              ),
          },
          {
            key: "reason",
            header: "原因",
            cell: (r) => r.reason ?? <span className="text-[#6B778C]">—</span>,
          },
        ]}
        empty="目前沒有 in_transit 的調撥單"
      />
    </main>
  );
}
