import { PartsShell } from "@/components/parts/parts-shell";
import { PartsTable, StatusBadge } from "@/components/parts/parts-table";
import { createClient } from "@/lib/supabase/server";

const PRICING_TYPE_LABELS: Record<string, { label: string; color: "blue" | "amber" | "purple" | "green" }> = {
  base: { label: "基本售價", color: "blue" },
  promo: { label: "促銷價", color: "amber" },
  member: { label: "會員價", color: "purple" },
  contract: { label: "合約價", color: "green" },
};

export default async function Page() {
  const supabase = await createClient();
  const [{ data: prices }, { data: items }, { data: orgs }] = await Promise.all([
    supabase
      .from("item_store_prices")
      .select("id, item_id, org_id, price, pricing_type, promo_start_date, promo_end_date, is_active")
      .order("updated_at", { ascending: false })
      .limit(500),
    supabase.from("items").select("id, code, name"),
    supabase.from("organizations").select("id, code, name").eq("is_active", true),
  ]);

  const itemMap = new Map((items ?? []).map((i) => [i.id, { code: i.code, name: i.name }]));
  const orgMap = new Map((orgs ?? []).map((o) => [o.id, `${o.code} · ${o.name}`]));

  return (
    <PartsShell
      title="門市定價"
      chapter="3.5"
      description="同一料件在不同門店、不同 type(基本 / 促銷 / 會員)的售價"
      breadcrumb={[
        { label: "庫存管理", href: "/parts" },
        { label: "基礎設定" },
        { label: "門市定價" },
      ]}
    >
      <PartsTable
        rows={prices ?? []}
        emptyText="尚未設定任何售價"
        columns={[
          {
            key: "item_id",
            label: "料件",
            render: (p) => {
              const item = itemMap.get(p.item_id);
              return item ? (
                <div>
                  <div className="font-mono text-[10px] text-[#185FA5]">{item.code}</div>
                  <div className="text-[11px]">{item.name}</div>
                </div>
              ) : (
                "—"
              );
            },
          },
          {
            key: "org_id",
            label: "門店",
            render: (p) => (p.org_id ? orgMap.get(p.org_id) ?? "全公司" : "全公司"),
          },
          {
            key: "pricing_type",
            label: "類型",
            align: "center",
            render: (p) => {
              const meta = PRICING_TYPE_LABELS[p.pricing_type] ?? PRICING_TYPE_LABELS.base;
              return <StatusBadge label={meta.label} color={meta.color} />;
            },
          },
          {
            key: "price",
            label: "售價",
            align: "right",
            render: (p) => <span className="font-semibold text-[#0F6E56]">NT$ {Number(p.price).toLocaleString()}</span>,
          },
          {
            key: "promo_period",
            label: "促銷期間",
            render: (p) => (p.promo_start_date && p.promo_end_date ? `${p.promo_start_date} ~ ${p.promo_end_date}` : "—"),
          },
          {
            key: "is_active",
            label: "狀態",
            align: "center",
            render: (p) => <StatusBadge label={p.is_active ? "啟用" : "停用"} color={p.is_active ? "green" : "gray"} />,
          },
        ]}
      />
    </PartsShell>
  );
}
