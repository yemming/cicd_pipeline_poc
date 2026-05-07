import { PartsShell } from "@/components/parts/parts-shell";
import { PartsTable, StatusBadge } from "@/components/parts/parts-table";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  const supabase = await createClient();
  const { data: suppliers } = await supabase
    .from("suppliers")
    .select(
      "id, code, name, default_currency, payment_terms, email, address, is_active, gl_payable_account_id",
    )
    .order("code");

  return (
    <PartsShell
      title="供應商資訊"
      chapter="2.3"
      description="採購單必須關聯供應商;每家供應商有預設幣別、付款條件、應付帳科目"
      breadcrumb={[
        { label: "庫存管理", href: "/parts" },
        { label: "基礎設定" },
        { label: "供應商資訊" },
      ]}
    >
      <PartsTable
        rows={suppliers ?? []}
        columns={[
          {
            key: "code",
            label: "供應商代號",
            render: (s) => <span className="font-mono text-[11px] text-[#185FA5]">{s.code}</span>,
          },
          { key: "name", label: "名稱" },
          { key: "default_currency", label: "幣別", align: "center" },
          { key: "payment_terms", label: "付款條件", render: (s) => s.payment_terms ?? "—" },
          { key: "email", label: "Email", render: (s) => <span className="text-[11px]">{s.email ?? "—"}</span> },
          {
            key: "is_active",
            label: "狀態",
            align: "center",
            render: (s) => <StatusBadge label={s.is_active ? "啟用" : "停用"} color={s.is_active ? "green" : "gray"} />,
          },
        ]}
      />
    </PartsShell>
  );
}
