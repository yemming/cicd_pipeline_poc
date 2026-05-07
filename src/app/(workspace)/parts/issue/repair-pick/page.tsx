import { PartsShell } from "@/components/parts/parts-shell";
import { PartsTable, StatusBadge, ComingSoonNote } from "@/components/parts/parts-table";
import { createClient } from "@/lib/supabase/server";

const STATUS_MAP: Record<string, { label: string; color: "gray" | "amber" | "green" | "red" }> = {
  draft: { label: "草稿", color: "gray" },
  pending: { label: "待出庫", color: "amber" },
  posted: { label: "已出庫", color: "green" },
  cancelled: { label: "已取消", color: "red" },
};

export default async function Page() {
  const supabase = await createClient();
  const [{ data: issues }, { data: lines }, { data: items }] = await Promise.all([
    supabase
      .from("stock_issues")
      .select("id, gi_no, issue_date, source_doc_type, source_doc_id, status, amount_total, posted_at, notes")
      .eq("source_doc_type", "work_order")
      .order("issue_date", { ascending: false })
      .limit(50),
    supabase.from("stock_issue_lines").select("gi_id, item_id, qty_issued, unit_cost, line_amount").limit(500),
    supabase.from("items").select("id, code, name"),
  ]);

  const list = issues ?? [];
  const itemMap = new Map((items ?? []).map((i) => [i.id, { code: i.code, name: i.name }]));
  const linesByGi = new Map<string, typeof lines>();
  for (const l of lines ?? []) {
    if (!linesByGi.has(l.gi_id)) linesByGi.set(l.gi_id, []);
    linesByGi.get(l.gi_id)!.push(l);
  }

  return (
    <PartsShell
      title="維修領料(RO 工單串接)"
      chapter="6.1"
      description="維修廠按 RO 工單領料 → 系統扣 stock_items 並建 GI 出庫單"
      breadcrumb={[
        { label: "庫存管理", href: "/parts" },
        { label: "出庫管理" },
        { label: "維修領料" },
      ]}
      toolbarRight={<ComingSoonNote feature="從 RO 工單一鍵領料" />}
    >
      <PartsTable
        rows={list}
        emptyText="尚無維修領料單。可從「維修工單(RO)」內按一鍵領料"
        columns={[
          { key: "gi_no", label: "領料單號", render: (g) => <span className="font-mono text-[11px] text-[#185FA5]">{g.gi_no}</span> },
          { key: "issue_date", label: "領料日" },
          { key: "source_doc_id", label: "RO 工單", render: (g) => (g.source_doc_id ? <span className="font-mono text-[10px]">{g.source_doc_id.slice(0, 12)}</span> : "—") },
          {
            key: "items",
            label: "料件",
            render: (g) => {
              const lns = linesByGi.get(g.id) ?? [];
              if (lns.length === 0) return <span className="text-[#9A9890] text-[10px]">—</span>;
              return (
                <div className="space-y-0.5">
                  {lns.slice(0, 3).map((l, idx) => {
                    const it = itemMap.get(l.item_id);
                    return (
                      <div key={idx} className="text-[10px]">
                        <span className="font-mono text-[#185FA5]">{it?.code ?? "—"}</span>
                        <span className="text-[#6B6A68]"> × {l.qty_issued}</span>
                      </div>
                    );
                  })}
                  {lns.length > 3 && <div className="text-[10px] text-[#9A9890]">+ {lns.length - 3} 件…</div>}
                </div>
              );
            },
          },
          {
            key: "amount_total",
            label: "成本",
            align: "right",
            render: (g) => `NT$ ${Math.round(Number(g.amount_total ?? 0)).toLocaleString()}`,
          },
          {
            key: "status",
            label: "狀態",
            align: "center",
            render: (g) => {
              const meta = STATUS_MAP[g.status] ?? STATUS_MAP.draft;
              return <StatusBadge label={meta.label} color={meta.color} />;
            },
          },
        ]}
      />
    </PartsShell>
  );
}
