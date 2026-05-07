import { PartsShell } from "@/components/parts/parts-shell";
import { PartsTable, StatusBadge, ComingSoonNote } from "@/components/parts/parts-table";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  const supabase = await createClient();
  const { data: counts } = await supabase
    .from("inventory_counts")
    .select("id, ct_no, count_date, status, total_lines, freeze_warehouse, notes")
    .in("status", ["draft", "in_progress", "pending_review"])
    .order("count_date", { ascending: false })
    .limit(20);

  return (
    <PartsShell
      title="庫存盤點作業"
      chapter="7.7"
      description="進行中的盤點任務 — 在 mobile / 平板上掃條碼回報"
      breadcrumb={[
        { label: "庫存管理", href: "/parts" },
        { label: "庫存作業" },
        { label: "庫存盤點作業" },
      ]}
      toolbarRight={<ComingSoonNote feature="條碼掃描" />}
    >
      <PartsTable
        rows={counts ?? []}
        emptyText="目前沒有進行中的盤點任務"
        columns={[
          { key: "ct_no", label: "盤點單號", render: (c) => <span className="font-mono text-[11px] text-[#185FA5]">{c.ct_no}</span> },
          { key: "count_date", label: "盤點日" },
          {
            key: "freeze_warehouse",
            label: "凍倉",
            align: "center",
            render: (c) => (c.freeze_warehouse ? "❄️" : "—"),
          },
          { key: "total_lines", label: "明細", align: "right" },
          {
            key: "status",
            label: "狀態",
            align: "center",
            render: (c) => {
              const colorMap: Record<string, "gray" | "blue" | "amber"> = {
                draft: "gray",
                in_progress: "blue",
                pending_review: "amber",
              };
              return <StatusBadge label={c.status} color={colorMap[c.status] ?? "gray"} />;
            },
          },
          { key: "notes", label: "備註", render: (c) => c.notes ?? "—" },
        ]}
      />
    </PartsShell>
  );
}
