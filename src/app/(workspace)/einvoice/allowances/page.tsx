import { redirect } from "next/navigation";
import Link from "next/link";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getEinvoiceAllowancesPageData } from "@/domain/einvoice";

export const dynamic = "force-dynamic";

const STATUS_CHIP: Record<string, string> = {
  issued:  "bg-[#EAF3DE] text-[#3B6D11]",
  failed:  "bg-[#FDECEA] text-[#CC0000]",
  invalid: "bg-[#F2F2F2] text-[#6B6A68]",
  pending: "bg-[#FDF3E3] text-[#854F0B]",
};

const STATUS_LABEL: Record<string, string> = {
  issued:  "已生效",
  failed:  "失敗",
  invalid: "已作廢",
  pending: "待處理",
};

export default async function AllowancesPage({
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
  const status = sp.status ?? "all";
  const dateFrom = sp.dateFrom ?? "";
  const dateTo   = sp.dateTo ?? "";

  const rows = await getEinvoiceAllowancesPageData({ status, dateFrom, dateTo });

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">折讓單</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          Sprint 0
        </span>
        <span className="text-[12px] text-[#9A9890]">所有發票折讓紀錄</span>
      </header>

      {/* Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <form method="get" className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">建立日（起）</label>
            <input type="date" name="dateFrom" defaultValue={dateFrom}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">建立日（迄）</label>
            <input type="date" name="dateTo" defaultValue={dateTo}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">狀態</label>
            <select name="status" defaultValue={status}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none">
              <option value="all">全部</option>
              <option value="issued">已生效</option>
              <option value="failed">失敗</option>
              <option value="invalid">已作廢</option>
              <option value="pending">待處理</option>
            </select>
          </div>
          <div className="flex gap-2 ml-auto">
            <button type="submit"
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45]">查詢</button>
            <Link href="/einvoice/allowances"
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] inline-flex items-center">重置</Link>
          </div>
        </form>
      </section>

      <div className="text-[12px] text-[#9A9890]">
        共 <b className="text-[#2C2C2A]">{rows.length}</b> 筆折讓單
      </div>

      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <table className="w-full text-[12px]">
          <thead className="text-[11px] text-[#9A9890] bg-[#F8F7F4]">
            <tr>
              <th className="text-left font-medium py-2 px-3">折讓號</th>
              <th className="text-left font-medium py-2 px-3">原發票號</th>
              <th className="text-right font-medium py-2 px-3">折讓金額</th>
              <th className="text-left font-medium py-2 px-3">狀態</th>
              <th className="text-left font-medium py-2 px-3">通知方式</th>
              <th className="text-left font-medium py-2 px-3">原因</th>
              <th className="text-left font-medium py-2 px-3">建立時間</th>
              <th className="text-left font-medium py-2 px-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={8} className="text-center py-12 text-[12px] text-[#9A9890]">尚無折讓紀錄</td></tr>
            )}
            {rows.map((a) => (
              <tr key={a.id} className="border-t border-[#F8F7F4] hover:bg-[#FBFAF7]">
                <td className="py-2 px-3 font-mono text-[#2C2C2A]">
                  {a.ecpay_allowance_no ?? <span className="text-[#9A9890]">—</span>}
                </td>
                <td className="py-2 px-3 font-mono text-[#5A5955]">
                  {a.einvoice?.ecpay_invoice_no ?? "—"}
                </td>
                <td className="py-2 px-3 text-right font-mono">
                  NT$ {a.total_amount.toLocaleString()}
                </td>
                <td className="py-2 px-3">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${STATUS_CHIP[a.status] ?? "bg-[#F2F2F2] text-[#6B6A68]"}`}>
                    {STATUS_LABEL[a.status] ?? a.status}
                  </span>
                  {a.status === "failed" && a.ecpay_error_msg && (
                    <span className="ml-1 text-[11px] text-[#CC0000]">{a.ecpay_error_msg.slice(0, 30)}</span>
                  )}
                </td>
                <td className="py-2 px-3 text-[#5A5955]">
                  {a.notify_method === "email" ? "Email"
                    : a.notify_method === "sms" ? "SMS"
                    : a.notify_method === "manual" ? "不通知"
                    : "—"}
                </td>
                <td className="py-2 px-3 text-[#5A5955] max-w-[200px] truncate" title={a.reason ?? undefined}>
                  {a.reason ?? "—"}
                </td>
                <td className="py-2 px-3 text-[#9A9890] text-[11.5px]">
                  {new Date(a.created_at).toLocaleString("zh-TW", { hour12: false })}
                </td>
                <td className="py-2 px-3">
                  <Link href={`/einvoice/${a.einvoice_id}`}
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
