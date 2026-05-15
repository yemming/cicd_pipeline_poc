import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { TransferDemoView } from "./_components/transfer-demo-view";

/**
 * /parts/aftersales/pre-inspections/transfer
 *
 * 預檢單 → RO 串接（Transfer Overlay）— **Demo 預覽頁**
 *
 * 對應設計稿：docs/DUCATI_售後工單模組_完整且含串接庫存版_20260510_最新版/04_預檢單_RO串接_v3.html
 * Phase 1 Proposal：docs/proposals/feature-aftersales-precheck-ro-phase1.md
 *
 * 為什麼是「demo 預覽」而非完整落地（自動拍板紀錄）：
 *  - 本頁的本質是 PI wizard Tab 5 的 inline overlay + `confirmTransferToRO` server action
 *  - 強依賴 4 張未存在的表：`pre_inspections` / `repair_orders` / `ro_lines` / `loop_cases`
 *  - PI wizard 主場（`precheck-sa`）尚未落地，沒有可嵌入 overlay 的 host 頁面
 *  - 本 demo 用 mock 資料把 transfer overlay 視覺重現，讓 stakeholder 可預覽 + 走 nav
 *  - 等 PI/RO 主場上線時，本頁的 overlay 元件會搬到 `pre-inspections/[id]/_components/transfer-overlay.tsx`，
 *    並接 `src/domain/pi-ro-transfer.ts`（proposal §9 / §11）
 *
 * 不寫入 DB、不建 server action、不建 helper（純 client render mock）。
 */

export const dynamic = "force-dynamic";

export default async function PreInspectionTransferDemoPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  return <TransferDemoView />;
}
