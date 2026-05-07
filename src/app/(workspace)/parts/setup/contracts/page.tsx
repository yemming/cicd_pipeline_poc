import { PartsShell } from "@/components/parts/parts-shell";
import { PartsTable, StatusBadge } from "@/components/parts/parts-table";
import { createClient } from "@/lib/supabase/server";

const STATUS_MAP: Record<string, { label: string; color: "green" | "amber" | "red" | "gray" }> = {
  active: { label: "有效中", color: "green" },
  expiring: { label: "即將到期", color: "amber" },
  expired: { label: "已過期", color: "red" },
  draft: { label: "草稿", color: "gray" },
};

export default async function Page() {
  const supabase = await createClient();
  const [{ data: contracts }, { data: suppliers }] = await Promise.all([
    supabase
      .from("supplier_contracts")
      .select("id, contract_no, supplier_id, effective_from, effective_to, status, payment_terms, min_order_amount, document_url, notes")
      .order("effective_from", { ascending: false }),
    supabase.from("suppliers").select("id, code, name"),
  ]);

  const list = contracts ?? [];
  const supplierMap = new Map((suppliers ?? []).map((s) => [s.id, `${s.code} · ${s.name}`]));

  return (
    <PartsShell
      title="採購合約"
      chapter="2.4"
      description="長期採購框架合約,定義付款條件 / 最低採購金額 / 有效期間"
      breadcrumb={[
        { label: "庫存管理", href: "/parts" },
        { label: "基礎設定" },
        { label: "採購合約" },
      ]}
    >
      <PartsTable
        rows={list}
        emptyText="尚未建立任何合約 — Indian 第一版可省略,直接在 PO 上手填條款"
        columns={[
          {
            key: "contract_no",
            label: "合約編號",
            render: (c) => <span className="font-mono text-[11px] text-[#185FA5]">{c.contract_no}</span>,
          },
          {
            key: "supplier_id",
            label: "供應商",
            render: (c) => supplierMap.get(c.supplier_id) ?? "—",
          },
          { key: "effective_from", label: "生效日" },
          { key: "effective_to", label: "到期日" },
          {
            key: "min_order_amount",
            label: "最低採購",
            align: "right",
            render: (c) => `NT$ ${Number(c.min_order_amount ?? 0).toLocaleString()}`,
          },
          {
            key: "status",
            label: "狀態",
            align: "center",
            render: (c) => {
              const meta = STATUS_MAP[c.status] ?? STATUS_MAP.draft;
              return <StatusBadge label={meta.label} color={meta.color} />;
            },
          },
        ]}
      />
    </PartsShell>
  );
}
