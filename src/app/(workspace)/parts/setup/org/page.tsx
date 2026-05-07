import { PartsShell } from "@/components/parts/parts-shell";
import { PartsTable, StatusBadge } from "@/components/parts/parts-table";
import { createClient } from "@/lib/supabase/server";

const LEVEL_LABELS: Record<number, { label: string; color: "blue" | "purple" | "amber" }> = {
  1: { label: "公司", color: "blue" },
  2: { label: "區域", color: "purple" },
  3: { label: "門店", color: "amber" },
};

export default async function Page() {
  const supabase = await createClient();
  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, code, name, level, parent_id, manager_user_id, address, phone, is_active")
    .order("level")
    .order("code");

  const list = orgs ?? [];
  const parentMap = new Map(list.map((o) => [o.id, o.name]));

  return (
    <PartsShell
      title="組織三層架構"
      chapter="1.1"
      description="公司 / 區域 / 門店 三層,定義權限隔離與報表彙總範圍"
      breadcrumb={[
        { label: "庫存管理", href: "/parts" },
        { label: "基礎設定" },
        { label: "組織三層架構" },
      ]}
    >
      <PartsTable
        rows={list}
        columns={[
          { key: "code", label: "代號", width: "100px", render: (r) => <span className="font-mono text-[11px]">{r.code}</span> },
          { key: "name", label: "名稱" },
          {
            key: "level",
            label: "層級",
            render: (r) => {
              const meta = LEVEL_LABELS[r.level] ?? { label: `Level ${r.level}`, color: "blue" as const };
              return <StatusBadge label={meta.label} color={meta.color} />;
            },
          },
          {
            key: "parent_id",
            label: "上層",
            render: (r) => (r.parent_id ? parentMap.get(r.parent_id) ?? "—" : "—"),
          },
          { key: "phone", label: "電話", render: (r) => r.phone ?? "—" },
          { key: "address", label: "地址", render: (r) => <span className="text-[11px] text-[#6B6A68] truncate">{r.address ?? "—"}</span> },
          {
            key: "is_active",
            label: "狀態",
            align: "center",
            render: (r) => <StatusBadge label={r.is_active ? "啟用" : "停用"} color={r.is_active ? "green" : "gray"} />,
          },
        ]}
        emptyText="尚未建立任何組織"
      />
    </PartsShell>
  );
}
