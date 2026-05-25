"use client";

import dynamic from "next/dynamic";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

// Excalidraw 觸及 window/document，必須避免 SSR 階段載入
const CanvasBufferImpl = dynamic(() => import("./canvas-buffer-impl"), {
  ssr: false,
  loading: () => (
    <div className="h-full min-h-[360px] flex items-center justify-center text-slate-400 text-sm bg-[#F4F5F7] border border-[#DFE1E6] rounded">
      <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>
      載入無限畫布…
    </div>
  ),
});

/**
 * Buffer 模式 Excalidraw — 給「ticket 還沒建」的新增頁用。
 * 不 autosave、不接 ticket_id；父層拿到 api 後在 submit 時呼叫 getSceneElements/getAppState/getFiles 取 snapshot
 * 跟 ticket insert 一起送 server。
 *
 * 跟 `<CanvasEditor>` 差別：CanvasEditor 是 detail page 用，autosave 進 feedback_canvas_snapshots。
 */
export function CanvasBuffer({
  onApiReady,
}: {
  onApiReady: (api: ExcalidrawImperativeAPI) => void;
}) {
  return <CanvasBufferImpl onApiReady={onApiReady} />;
}
