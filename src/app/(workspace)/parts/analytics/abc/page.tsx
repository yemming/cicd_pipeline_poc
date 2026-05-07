import { PartsShell } from "@/components/parts/parts-shell";
import { PartsTable, StatusBadge } from "@/components/parts/parts-table";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  const supabase = await createClient();
  const [{ data: results }, { data: items }] = await Promise.all([
    supabase
      .from("abc_classification_results")
      .select("id, item_id, abc_class, prev_class, output_qty_12m, output_amount_12m, cum_pct, rank_in_brand, recalc_at")
      .order("rank_in_brand"),
    supabase.from("items").select("id, code, name"),
  ]);

  const list = results ?? [];
  const itemMap = new Map((items ?? []).map((i) => [i.id, { code: i.code, name: i.name }]));

  // 統計各 class 數量
  const classCounts = list.reduce<Record<string, number>>((acc, r) => {
    acc[r.abc_class] = (acc[r.abc_class] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <PartsShell
      title="ABC 分類"
      chapter="12.2"
      description="按 12 個月出庫累計金額排序,A=前 80%、B=80-95%、C=後 5%"
      breadcrumb={[
        { label: "庫存管理", href: "/parts" },
        { label: "分析報表" },
        { label: "ABC 分類" },
      ]}
    >
      <div className="grid md:grid-cols-3 gap-3 mb-4">
        <ClassCard cls="A" count={classCounts.A ?? 0} desc="高週轉,佔總出庫金額前 80%,庫存盤點頻率高" />
        <ClassCard cls="B" count={classCounts.B ?? 0} desc="中週轉,佔 80%-95% 區間,適度補貨" />
        <ClassCard cls="C" count={classCounts.C ?? 0} desc="低週轉,佔後 5%,可考慮減少安全庫存或退場" />
      </div>

      <PartsTable
        rows={list}
        emptyText="尚未跑過 ABC 分類 — 請到「ABC 分類設定」啟動 recalc"
        columns={[
          { key: "rank_in_brand", label: "排名", align: "right", width: "60px", render: (r) => <span className="font-mono text-[11px]">#{r.rank_in_brand}</span> },
          {
            key: "item_id",
            label: "料件",
            render: (r) => {
              const item = itemMap.get(r.item_id);
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
            key: "abc_class",
            label: "ABC",
            align: "center",
            render: (r) => (
              <span
                className={`inline-block w-6 h-6 rounded-full text-[11px] font-bold leading-6 ${
                  r.abc_class === "A"
                    ? "bg-[#FDECEA] text-[#CC0000]"
                    : r.abc_class === "B"
                      ? "bg-[#FDF3E3] text-[#854F0B]"
                      : "bg-[#F5F5F4] text-[#6B6A68]"
                }`}
              >
                {r.abc_class}
              </span>
            ),
          },
          {
            key: "prev_class",
            label: "上次",
            align: "center",
            render: (r) =>
              r.prev_class && r.prev_class !== r.abc_class ? (
                <span className="text-[10px] text-[#9A9890]">
                  {r.prev_class} → {r.abc_class}
                </span>
              ) : (
                <span className="text-[10px] text-[#9A9890]">—</span>
              ),
          },
          { key: "output_qty_12m", label: "12 月出庫", align: "right", render: (r) => Number(r.output_qty_12m ?? 0).toLocaleString() },
          {
            key: "output_amount_12m",
            label: "12 月金額",
            align: "right",
            render: (r) => <span className="font-semibold text-[#0F6E56]">NT$ {Math.round(Number(r.output_amount_12m ?? 0)).toLocaleString()}</span>,
          },
          { key: "cum_pct", label: "累計%", align: "right", render: (r) => `${Number(r.cum_pct ?? 0).toFixed(1)}%` },
        ]}
      />
    </PartsShell>
  );
}

function ClassCard({ cls, count, desc }: { cls: string; count: number; desc: string }) {
  const colors = {
    A: { bg: "#FDECEA", color: "#CC0000" },
    B: { bg: "#FDF3E3", color: "#854F0B" },
    C: { bg: "#F5F5F4", color: "#6B6A68" },
  } as const;
  const c = colors[cls as keyof typeof colors];
  return (
    <div className="bg-white rounded-lg border-2 p-4" style={{ borderColor: c.bg }}>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-[24px] font-bold" style={{ color: c.color }}>{cls}</span>
        <span className="text-[11px] text-[#9A9890]">類</span>
        <span className="ml-auto text-[20px] font-bold" style={{ color: c.color }}>
          {count}
        </span>
        <span className="text-[11px] text-[#9A9890]">種</span>
      </div>
      <p className="text-[11px] text-[#6B6A68] leading-relaxed">{desc}</p>
    </div>
  );
}
