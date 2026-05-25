"use client";

import { useMemo } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import type {
  AppState,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";

export default function CanvasBufferImpl({
  onApiReady,
}: {
  onApiReady: (api: ExcalidrawImperativeAPI) => void;
}) {
  const initialData = useMemo(
    () => ({
      appState: {
        viewBackgroundColor: "#ffffff",
        currentItemStrokeWidth: 2,
      } as Partial<AppState>,
      scrollToContent: false,
    }),
    [],
  );

  return (
    // 吃滿父層高度（form 的 flex-1 或 min-h 由父層決定）；最低 360px 保底
    <div className="h-full min-h-[360px] border border-[#DFE1E6] rounded overflow-hidden bg-white">
      <Excalidraw
        excalidrawAPI={(api) => onApiReady(api)}
        initialData={initialData}
      />
    </div>
  );
}
