/**
 * /parts/aftersales — 售後修護模組導覽（從 parts 模組入口進）
 *
 * 共用元件 <AftersalesFlowDiagram> 同時掛在 `/service` route，
 * Phase 3B C0a 兩 route 一份元件，這邊只差「返回」連結指回 /parts。
 */

import AftersalesFlowDiagram from "@/components/aftersales-flow-diagram";

export default async function PartsAftersalesPage() {
  return <AftersalesFlowDiagram backHref="/parts" backLabel="← 模組總覽" />;
}
