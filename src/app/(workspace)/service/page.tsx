/**
 * /service — 售後修護模組首頁（C0a）
 *
 * 與 /parts/aftersales 共用 <AftersalesFlowDiagram> 元件、同一份流程關係圖。
 * 解掉了 Phase 1 sidebar 驗收撞到的 /service 404（之前沒有 root page）。
 */

import AftersalesFlowDiagram from "@/components/aftersales-flow-diagram";

export default async function ServicePage() {
  return (
    <AftersalesFlowDiagram
      backHref="/service/appointments"
      backLabel="← 預約管理"
    />
  );
}
