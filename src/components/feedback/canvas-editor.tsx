"use client";

import dynamic from "next/dynamic";

// tldraw 觸及 window/navigator，必須避免 SSR 階段載入
const CanvasEditorImpl = dynamic(() => import("./canvas-editor-impl"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
      <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>
      載入無限畫布…
    </div>
  ),
});

export function CanvasEditor(props: {
  ticketId: string;
  initialSnapshot: unknown;
}) {
  return <CanvasEditorImpl {...props} />;
}
