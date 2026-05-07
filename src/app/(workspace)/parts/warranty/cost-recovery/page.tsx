import { PartsShell } from "@/components/parts/parts-shell";
import { PartsTable, StatusBadge } from "@/components/parts/parts-table";
import { createClient } from "@/lib/supabase/server";

const STATUS_MAP: Record<string, { label: string; color: "gray" | "amber" | "blue" | "green" | "red" }> = {
  draft: { label: "草稿", color: "gray" },
  submitted: { label: "已送原廠", color: "amber" },
  reviewing: { label: "審核中", color: "blue" },
  approved: { label: "核准", color: "green" },
  paid: { label: "已撥款", color: "green" },
  rejected: { label: "退件", color: "red" },
};

export default async function Page() {
  const supabase = await createClient();
  const { data: claims } = await supabase
    .from("warranty_claims")
    .select(
      "id, cl_no, claim_type, claim_date, customer_id, applied_amount, approved_amount, forecast_receipt_date, actual_receipt_date, gl_posted, status, notes",
    )
    .order("claim_date", { ascending: false })
    .limit(100);

  const list = claims ?? [];

  // 統計
  const stats = list.reduce(
    (acc, c) => {
      acc.total += 1;
      acc.applied += Number(c.applied_amount ?? 0);
      acc.approved += Number(c.approved_amount ?? 0);
      if (c.status === "paid") acc.paid += 1;
      if (c.status === "rejected") acc.rejected += 1;
      return acc;
    },
    { total: 0, applied: 0, approved: 0, paid: 0, rejected: 0 },
  );

  return (
    <PartsShell
      title="費用回收"
      chapter="11.6"
      description="保固索賠 → 送原廠 → 核准 → 撥款,追蹤每張單的回收金額與時程"
      breadcrumb={[
        { label: "庫存管理", href: "/parts" },
        { label: "保固索賠" },
        { label: "費用回收" },
      ]}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Stat label="索賠單數" value={`${stats.total}`} unit="張" color="#185FA5" />
        <Stat label="申請金額" value={`NT$ ${stats.applied.toLocaleString()}`} color="#854F0B" />
        <Stat label="核准金額" value={`NT$ ${stats.approved.toLocaleString()}`} color="#0F6E56" />
        <Stat
          label="回收率"
          value={stats.applied > 0 ? `${Math.round((stats.approved / stats.applied) * 100)}%` : "—"}
          color="#7F77DD"
        />
      </div>

      <PartsTable
        rows={list}
        emptyText="尚無索賠單"
        columns={[
          { key: "cl_no", label: "索賠單號", render: (c) => <span className="font-mono text-[11px] text-[#185FA5]">{c.cl_no}</span> },
          { key: "claim_type", label: "類型" },
          { key: "claim_date", label: "申請日" },
          {
            key: "applied_amount",
            label: "申請金額",
            align: "right",
            render: (c) => `NT$ ${Number(c.applied_amount ?? 0).toLocaleString()}`,
          },
          {
            key: "approved_amount",
            label: "核准金額",
            align: "right",
            render: (c) => <span className="font-semibold text-[#0F6E56]">NT$ {Number(c.approved_amount ?? 0).toLocaleString()}</span>,
          },
          { key: "forecast_receipt_date", label: "預計撥款", render: (c) => c.forecast_receipt_date ?? "—" },
          { key: "actual_receipt_date", label: "實際撥款", render: (c) => c.actual_receipt_date ?? "—" },
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

function Stat({ label, value, unit, color }: { label: string; value: string; unit?: string; color: string }) {
  return (
    <div className="bg-white rounded-lg border border-[#EEECE6] px-3 py-2.5">
      <div className="text-[10px] text-[#9A9890] uppercase tracking-wide">{label}</div>
      <div className="text-[18px] font-bold mt-0.5" style={{ color }}>
        {value}
        {unit && <span className="text-[11px] text-[#9A9890] font-medium ml-1">{unit}</span>}
      </div>
    </div>
  );
}
