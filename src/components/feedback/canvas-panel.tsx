"use client";

import dynamic from "next/dynamic";

const CanvasPanelImpl = dynamic(() => import("./canvas-panel-impl"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center text-[#6B778C] text-sm bg-[#F4F5F7]">
      <span className="material-symbols-outlined animate-spin mr-2 text-[#0052CC]">
        progress_activity
      </span>
      載入畫布…
    </div>
  ),
});

export function CanvasPanel(props: {
  ticketId: string;
  initialSnapshot: unknown;
}) {
  return <CanvasPanelImpl {...props} />;
}
