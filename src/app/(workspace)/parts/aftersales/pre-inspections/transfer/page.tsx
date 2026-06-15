import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { TransferDemoView } from "./_components/transfer-demo-view";

/**
 * /parts/aftersales/pre-inspections/transfer
 *
 * 預檢單 → RO 串接（Transfer Overlay）— **Admin-Only Demo 預覽頁**
 *
 * 對應設計稿：docs/DUCATI_售後工單模組_完整且含串接庫存版_20260510_最新版/04_預檢單_RO串接_v3.html
 * Phase 1 Proposal：docs/proposals/feature-aftersales-precheck-ro-phase1.md
 *
 * 為什麼是「admin-only demo 預覽」：
 *  - 本頁含 mock 假資料（鄭宗勳 / Diavel V4 / ZDM1 VIN），是 stakeholder 視覺確認用
 *  - SA 視角不應看到 mock 資料，避免誤以為是真實工單
 *  - 正式轉 RO 流程已在 wizard Tab 5 的「確認並轉入正式工單 RO」按鈕實現
 *
 * 非 admin → 顯示「此為內部 demo 頁」紅字提示。
 */

export const dynamic = "force-dynamic";

export default async function PreInspectionTransferDemoPage() {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!isAdmin) {
    return (
      <main className="px-6 py-8">
        <p className="text-[14px] text-[#CC0000] font-medium">
          此為內部 demo 頁，僅限系統管理員存取。
        </p>
        <p className="text-[12.5px] text-[#5A5955] mt-1.5">
          正式的「預檢單轉工單」流程請在預檢單詳情頁 Tab 5 完成雙簽後操作。
        </p>
      </main>
    );
  }

  return <TransferDemoView />;
}
