/**
 * Visualization Sandbox — P0-3 共用 visualization 元件 playground。
 *
 * 7 個元件 (KpiCard / StatusDot / KanbanBoard / Timeline / FlowDiagram / HierarchyTree / MatrixSelector)
 * 各 render 一組 sample，給後面 70+ 頁升 A 級時參考用法。
 *
 * 純 client component，不打 server / DB；改 prop / tone / layout 看視覺差異即可。
 */

import VisualizationSandboxBoard from "./_components/sandbox-board";

export const dynamic = "force-static";

export default function VisualizationSandboxPage() {
  return (
    <main className="px-6 py-6 max-w-[1280px] space-y-8">
      <header className="space-y-1.5">
        <div className="flex items-center gap-2.5">
          <h1 className="text-[18px] font-semibold text-[#2C2C2A]">Visualization Sandbox</h1>
          <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
            P0-3 · A 級基建
          </span>
        </div>
        <p className="text-[12.5px] text-[#5A5955]">
          DealerOS 全站共用 visualization 元件 playground。元件全在
          <code className="font-mono text-[11.5px] bg-[#F8F7F4] px-1 rounded mx-1">
            src/components/visualization/
          </code>
          ，下面 7 個區塊各示範一個元件的所有 prop 變體。
        </p>
      </header>

      <VisualizationSandboxBoard />
    </main>
  );
}
