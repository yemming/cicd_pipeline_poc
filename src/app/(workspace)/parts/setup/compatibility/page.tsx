import { PartsShell } from "@/components/parts/parts-shell";
import { PartsTable, StatusBadge } from "@/components/parts/parts-table";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  const supabase = await createClient();
  const [{ data: compats }, { data: items }, { data: models }] = await Promise.all([
    supabase
      .from("item_motorcycle_compatibility")
      .select("id, item_id, motorcycle_model_id, year_start, year_end, is_verified, notes")
      .limit(500),
    supabase.from("items").select("id, code, name").eq("is_active", true),
    supabase.from("motorcycle_models").select("id, display_name, model_name, series, engine_cc"),
  ]);

  const itemMap = new Map((items ?? []).map((i) => [i.id, { code: i.code, name: i.name }]));
  const modelMap = new Map((models ?? []).map((m) => [m.id, { display: m.display_name, series: m.series }]));

  return (
    <PartsShell
      title="適配設定(料件 ↔ 機型)"
      chapter="3.4"
      description="一個料件適用於哪些機型 / 年份;維修領料時系統會驗證料件對 RO 機型有沒有適配紀錄"
      breadcrumb={[
        { label: "庫存管理", href: "/parts" },
        { label: "基礎設定" },
        { label: "適配設定" },
      ]}
    >
      <PartsTable
        rows={compats ?? []}
        emptyText="尚未建立任何適配紀錄"
        columns={[
          {
            key: "item_id",
            label: "料件",
            render: (c) => {
              const item = itemMap.get(c.item_id);
              return item ? (
                <div>
                  <div className="font-mono text-[10px] text-[#185FA5]">{item.code}</div>
                  <div className="text-[12px]">{item.name}</div>
                </div>
              ) : (
                "—"
              );
            },
          },
          {
            key: "motorcycle_model_id",
            label: "機型",
            render: (c) => {
              const m = modelMap.get(c.motorcycle_model_id);
              return m ? (
                <div>
                  <div className="text-[12px] font-medium">{m.display}</div>
                  <div className="text-[10px] text-[#9A9890]">{m.series}</div>
                </div>
              ) : (
                "—"
              );
            },
          },
          {
            key: "years",
            label: "適用年份",
            render: (c) => `${c.year_start ?? "—"} - ${c.year_end ?? "—"}`,
          },
          {
            key: "is_verified",
            label: "驗證",
            align: "center",
            render: (c) => <StatusBadge label={c.is_verified ? "✓ 已驗證" : "待驗證"} color={c.is_verified ? "green" : "amber"} />,
          },
          { key: "notes", label: "備註", render: (c) => c.notes ?? "—" },
        ]}
      />
    </PartsShell>
  );
}
