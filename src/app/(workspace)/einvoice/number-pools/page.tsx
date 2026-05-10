import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

import { SyncPoolsButton } from "./_components/sync-pools-button";

export const dynamic = "force-dynamic";

type PoolRow = {
  id: string;
  period: string;
  prefix: string;
  start_no: number;
  end_no: number;
  used_count: number;
  is_active: boolean;
  synced_at: string | null;
  created_at: string;
};

export default async function NumberPoolsPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.EINVOICE_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視電子發票的權限</p>
      </main>
    );
  }

  const canSync = await hasPermission(PERMISSIONS.EINVOICE_SETTINGS);
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data, error } = await supabase
    .from("einvoice_number_pools")
    .select("id, period, prefix, start_no, end_no, used_count, is_active, synced_at, created_at")
    .eq("brand_id", brand)
    .order("period", { ascending: false })
    .order("prefix");

  if (error) throw new Error(`einvoice_number_pools: ${error.message}`);
  const rows = (data ?? []) as PoolRow[];

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">字軌與發票號碼</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          Sprint 1 · 字軌管理
        </span>
        <span className="text-[12px] text-[#9A9890]">
          綠界配發的字軌期別與號碼區段
        </span>
        {canSync && (
          <div className="ml-auto">
            <SyncPoolsButton />
          </div>
        )}
      </header>

      <div className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <p className="text-[13px] text-[#5A5955]">
          台灣電子發票每兩個月會由財政部配發一批字軌（兩碼英文）+ 號碼區段（8 位數字）。
          本頁追蹤當前可用配額、使用情況、上次同步時間。
        </p>
        <p className="text-[12.5px] text-[#9A9890] mt-2">
          ⓘ 同步功能呼叫綠界 <code className="font-mono">/B2CInvoice/GetInvoiceWordSetting</code>，
          需要 <code className="font-mono">einvoice.settings</code> 權限。
        </p>
      </div>

      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">字軌期別</span>
          <span className="ml-auto text-[11px] text-[#9A9890]">{rows.length} 筆紀錄</span>
        </header>
        <table className="w-full text-[12px]">
          <thead className="text-[11px] text-[#9A9890] bg-[#FBFAF7]">
            <tr>
              <th className="text-left font-medium py-2 px-3">期別</th>
              <th className="text-left font-medium py-2 px-3">字軌</th>
              <th className="text-right font-medium py-2 px-3">起號</th>
              <th className="text-right font-medium py-2 px-3">迄號</th>
              <th className="text-right font-medium py-2 px-3">已用 / 總量</th>
              <th className="text-left font-medium py-2 px-3">啟用</th>
              <th className="text-left font-medium py-2 px-3">同步時間</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-12 text-[12px] text-[#9A9890]">
                  尚未同步字軌配號。請先在綠界商家後台確認配號或聯繫綠界客服。
                </td>
              </tr>
            )}
            {rows.map((p) => {
              const total = p.end_no - p.start_no + 1;
              const pct = Math.round((p.used_count / total) * 100);
              return (
                <tr key={p.id} className="border-t border-[#F8F7F4]">
                  <td className="py-2 px-3 font-mono text-[#2C2C2A]">{p.period}</td>
                  <td className="py-2 px-3 font-mono text-[#2C2C2A]">{p.prefix}</td>
                  <td className="py-2 px-3 text-right font-mono">{p.start_no.toString().padStart(8, "0")}</td>
                  <td className="py-2 px-3 text-right font-mono">{p.end_no.toString().padStart(8, "0")}</td>
                  <td className="py-2 px-3 text-right font-mono">
                    <span className={pct > 90 ? "text-[#CC0000]" : pct > 70 ? "text-[#854F0B]" : "text-[#5A5955]"}>
                      {p.used_count.toLocaleString()} / {total.toLocaleString()}
                    </span>
                    <span className="ml-1 text-[11px] text-[#9A9890]">({pct}%)</span>
                  </td>
                  <td className="py-2 px-3">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${
                      p.is_active ? "bg-[#EAF3DE] text-[#3B6D11]" : "bg-[#F2F2F2] text-[#6B6A68]"
                    }`}>
                      {p.is_active ? "啟用中" : "停用"}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-[#9A9890] text-[11.5px]">
                    {p.synced_at ? new Date(p.synced_at).toLocaleString("zh-TW", { hour12: false }) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </main>
  );
}
