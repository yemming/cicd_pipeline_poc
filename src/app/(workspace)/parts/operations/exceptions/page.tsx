import { redirect } from "next/navigation";

import { DataTable } from "@/components/forms/data-table";
import { getBrandKey } from "@/lib/brands/current";
import { listItems } from "@/lib/master-data/queries";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import type { Warehouse } from "@/lib/parts/types";

import { ExceptionForm } from "./_components/exception-form";

export const dynamic = "force-dynamic";

async function getExceptionDocs() {
  const supabase = await createClient();
  const [recv, iss] = await Promise.all([
    supabase.from("stock_receipts").select("id, gr_no, warehouse_id, qty_received_total, amount_total, status, posted_at, notes")
      .eq("brand_id", getBrandKey()).eq("type", "exception").order("created_at", { ascending: false }).limit(50),
    supabase.from("stock_issues").select("id, gi_no, warehouse_id, qty_issued_total, amount_total, status, posted_at, notes")
      .eq("brand_id", getBrandKey()).eq("type", "exception").order("created_at", { ascending: false }).limit(50),
  ]);
  const rows = [
    ...(recv.data ?? []).map((r) => ({ ...r, doc_no: r.gr_no, direction: "in" as const, qty: r.qty_received_total })),
    ...(iss.data ?? []).map((r) => ({ ...r, doc_no: r.gi_no, direction: "out" as const, qty: r.qty_issued_total })),
  ];
  return rows.sort((a, b) => (b.posted_at ?? "").localeCompare(a.posted_at ?? ""));
}

async function getWarehouses(): Promise<Warehouse[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("warehouses").select("*")
    .eq("brand_id", getBrandKey()).eq("is_active", true).order("code");
  if (error) throw new Error(`getWarehouses: ${error.message}`);
  return data ?? [];
}

export default async function ExceptionsPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.EXCEPTION_OPS))) {
    return <main className="px-6 py-6"><p className="text-[14px] text-[#BF2600]">沒權限</p></main>;
  }

  const [docs, warehouses, items] = await Promise.all([
    getExceptionDocs(),
    getWarehouses(),
    listItems({ limit: 500 }),
  ]);
  const whById = new Map(warehouses.map((w) => [w.id, w]));

  return (
    <main className="px-6 py-6 space-y-5">
      <header className="space-y-1">
        <h1 className="text-[20px] font-bold text-[#172B4D]">例外出入庫</h1>
        <p className="text-[13px] text-[#6B778C]">
          不走 PO/RO 流程的直接增減庫存。共 {docs.length} 筆例外單。
        </p>
      </header>

      <ExceptionForm warehouses={warehouses} items={items} />

      <DataTable
        rows={docs}
        getKey={(d) => d.id}
        columns={[
          { key: "doc_no", header: "單號", width: "150px", cell: (d) => <span className="font-mono text-[12px]">{d.doc_no}</span> },
          { key: "direction", header: "方向", width: "70px", cell: (d) => (
            <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${d.direction === "in" ? "bg-[#E3FCEF] text-[#006644]" : "bg-[#FFEBE6] text-[#BF2600]"}`}>
              {d.direction === "in" ? "入庫" : "出庫"}
            </span>
          )},
          { key: "warehouse", header: "倉庫", width: "150px", cell: (d) => <span className="font-mono text-[12px]">{whById.get(d.warehouse_id)?.code ?? "—"}</span> },
          { key: "qty", header: "數量", align: "right", width: "80px", cell: (d) => Number(d.qty).toLocaleString() },
          { key: "amount", header: "金額", align: "right", width: "130px", cell: (d) => `NT$ ${Math.round(Number(d.amount_total)).toLocaleString()}` },
          { key: "notes", header: "備註", cell: (d) => d.notes ?? "—" },
          { key: "posted", header: "Post 時間", width: "150px", cell: (d) => d.posted_at ? new Date(d.posted_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }) : "—" },
        ]}
        empty="尚無例外出入庫單"
      />
    </main>
  );
}
