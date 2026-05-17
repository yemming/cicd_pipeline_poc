import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getEinvoiceNumberPoolsPageData } from "@/domain/einvoice";

import { SyncPoolsButton } from "./_components/sync-pools-button";
import { PoolsBoard } from "./_components/pools-board";

export const dynamic = "force-dynamic";

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
  const rows = await getEinvoiceNumberPoolsPageData();

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

      <div className="text-[12px] text-[#9A9890]">
        共 <b className="text-[#2C2C2A]">{rows.length}</b> 筆字軌紀錄
      </div>

      <PoolsBoard rows={rows} />
    </main>
  );
}
