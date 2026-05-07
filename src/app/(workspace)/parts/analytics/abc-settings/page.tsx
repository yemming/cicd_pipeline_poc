import { PartsShell } from "@/components/parts/parts-shell";
import { ComingSoonNote } from "@/components/parts/parts-table";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  const supabase = await createClient();
  const { data: configs } = await supabase
    .from("abc_classification_config")
    .select("*")
    .limit(1);

  const config = configs?.[0];

  return (
    <PartsShell
      title="ABC 分類設定"
      chapter="12.3"
      description="定義 A/B/C 切點、重算頻率、新品保護期、安全庫存天數"
      breadcrumb={[
        { label: "庫存管理", href: "/parts" },
        { label: "分析報表" },
        { label: "ABC 分類設定" },
      ]}
    >
      {!config ? (
        <div className="bg-[#FFF9F0] border border-[#FDF3E3] rounded-lg p-6 text-center">
          <p className="text-[14px] text-[#854F0B] mb-2">尚未建立 ABC 分類設定</p>
          <p className="text-[12px] text-[#6B6A68]">系統會在第一次跑 recalc 時自動產生預設設定</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-[#EEECE6] p-5">
          <div className="grid md:grid-cols-2 gap-x-8 gap-y-4">
            <Field label="重算觸發">{config.recalc_trigger ?? "manual"}</Field>
            <Field label="計算週期">{config.rolling_period_months ?? 12} 個月</Field>
            <Field label="上次重算">
              {config.last_recalc_at ? new Date(config.last_recalc_at).toLocaleString("zh-TW", { hour12: false }) : "—"}
            </Field>
            <Field label="新品預設分類">{config.new_item_default_class ?? "C"}</Field>
            <Field label="新品保護月數">{config.new_item_grace_months ?? 3} 個月</Field>
            <Field label="A 盤點頻率">{config.count_freq_a_days ?? 30} 天 / 次</Field>
            <Field label="B 盤點頻率">{config.count_freq_b_days ?? 90} 天 / 次</Field>
            <Field label="C 盤點頻率">{config.count_freq_c_days ?? 180} 天 / 次</Field>
            <Field label="A 安全庫存天數">{config.safety_stock_days_a ?? 14} 天</Field>
            <Field label="B 安全庫存天數">{config.safety_stock_days_b ?? 30} 天</Field>
          </div>
          <div className="mt-5 pt-4 border-t border-[#F5F5F4]">
            <ComingSoonNote feature="設定編輯" />
          </div>
        </div>
      )}
    </PartsShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase font-semibold text-[#9A9890] tracking-wide">{label}</div>
      <div className="text-[14px] font-medium text-[#1A1917] mt-0.5">{children}</div>
    </div>
  );
}
