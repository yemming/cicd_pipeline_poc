import { redirect } from "next/navigation";
import Link from "next/link";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getEinvoiceVoidsPageData } from "@/domain/einvoice";

export const dynamic = "force-dynamic";

export default async function VoidsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.EINVOICE_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視電子發票的權限</p>
      </main>
    );
  }

  const sp = await searchParams;
  const dateFrom = sp.dateFrom ?? "";
  const dateTo   = sp.dateTo ?? "";

  const rows = await getEinvoiceVoidsPageData({ dateFrom, dateTo });

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">作廢紀錄</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          Sprint 0
        </span>
        <span className="text-[12px] text-[#9A9890]">所有發票作廢歷程</span>
      </header>

      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <form method="get" className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">作廢日（起）</label>
            <input type="date" name="dateFrom" defaultValue={dateFrom}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">作廢日（迄）</label>
            <input type="date" name="dateTo" defaultValue={dateTo}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none" />
          </div>
          <div className="flex gap-2 ml-auto">
            <button type="submit"
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45]">查詢</button>
            <Link href="/einvoice/voids"
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] inline-flex items-center">重置</Link>
          </div>
        </form>
      </section>

      <div className="text-[12px] text-[#9A9890]">
        共 <b className="text-[#2C2C2A]">{rows.length}</b> 筆作廢紀錄
      </div>

      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <table className="w-full text-[12px]">
          <thead className="text-[11px] text-[#9A9890] bg-[#F8F7F4]">
            <tr>
              <th className="text-left font-medium py-2 px-3">作廢時間</th>
              <th className="text-left font-medium py-2 px-3">原發票號</th>
              <th className="text-right font-medium py-2 px-3">原金額</th>
              <th className="text-left font-medium py-2 px-3">作廢原因</th>
              <th className="text-left font-medium py-2 px-3">操作人</th>
              <th className="text-left font-medium py-2 px-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="text-center py-12 text-[12px] text-[#9A9890]">尚無作廢紀錄</td></tr>
            )}
            {rows.map((v) => (
              <tr key={v.id} className="border-t border-[#F8F7F4] hover:bg-[#FBFAF7]">
                <td className="py-2 px-3 text-[#5A5955]">
                  {new Date(v.voided_at).toLocaleString("zh-TW", { hour12: false })}
                </td>
                <td className="py-2 px-3 font-mono text-[#2C2C2A]">
                  {v.einvoice?.ecpay_invoice_no ?? "—"}
                </td>
                <td className="py-2 px-3 text-right font-mono text-[#5A5955]">
                  {v.einvoice ? `NT$ ${v.einvoice.total_amount.toLocaleString()}` : "—"}
                </td>
                <td className="py-2 px-3 text-[#2C2C2A]">{v.reason}</td>
                <td className="py-2 px-3 font-mono text-[11.5px] text-[#9A9890]">
                  {v.voided_by ? v.voided_by.slice(0, 8) : "—"}
                </td>
                <td className="py-2 px-3">
                  <Link href={`/einvoice/${v.einvoice_id}`}
                    className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] inline-flex items-center">
                    查看發票
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
