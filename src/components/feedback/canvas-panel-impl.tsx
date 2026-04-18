"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Excalidraw, getSceneVersion, restore } from "@excalidraw/excalidraw";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import "@excalidraw/excalidraw/index.css";
import { createClient } from "@/lib/supabase/client";

type SaveStatus = "idle" | "saving" | "saved" | "error";

type StoredSnapshot = {
  elements?: readonly OrderedExcalidrawElement[];
  appState?: Partial<AppState>;
  files?: BinaryFiles;
};

export default function CanvasPanelImpl({
  ticketId,
  initialSnapshot,
}: {
  ticketId: string;
  initialSnapshot: unknown;
}) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const saveTimer = useRef<number | null>(null);
  const lastVersionRef = useRef<number>(-1);

  const initialData = useMemo(() => {
    const snap = initialSnapshot as StoredSnapshot | null | undefined;
    const hasElements = snap && Array.isArray(snap.elements) && snap.elements.length >= 0;
    const baseAppState: Partial<AppState> = {
      viewBackgroundColor: "#ffffff",
      gridSize: 20,
    };
    if (!hasElements) {
      return { appState: baseAppState, scrollToContent: false };
    }
    const restored = restore(
      {
        elements: snap!.elements ?? [],
        appState: { ...baseAppState, ...(snap!.appState ?? {}) },
        files: snap!.files ?? {},
      },
      null,
      null
    );
    return {
      elements: restored.elements,
      appState: restored.appState,
      files: restored.files,
      scrollToContent: false,
    };
  }, [initialSnapshot]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    setSaveStatus("saving");
    saveTimer.current = window.setTimeout(async () => {
      const api = apiRef.current;
      if (!api) return;
      const elements = api.getSceneElements();
      const appState = api.getAppState();
      const files = api.getFiles();
      const { collaborators: _c, ...cleanAppState } = appState;
      void _c;
      const snapshot = { elements, appState: cleanAppState, files };
      const supabase = createClient();
      const { error } = await supabase
        .from("feedback_canvas_snapshots")
        .upsert({ ticket_id: ticketId, snapshot });
      setSaveStatus(error ? "error" : "saved");
    }, 1500);
  }, [ticketId]);

  const onChange = useCallback(
    (elements: readonly OrderedExcalidrawElement[]) => {
      const v = getSceneVersion(elements);
      if (v === lastVersionRef.current) return;
      const first = lastVersionRef.current === -1;
      lastVersionRef.current = v;
      if (first) return;
      scheduleSave();
    },
    [scheduleSave]
  );

  useEffect(
    () => () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    },
    []
  );

  const saveCfg = {
    idle:   { icon: "cloud",             label: "就緒",     cls: "text-[#6B778C]" },
    saving: { icon: "progress_activity", label: "儲存中…", cls: "text-[#C9A84C] animate-pulse" },
    saved:  { icon: "cloud_done",        label: "已儲存",   cls: "text-[#36B37E]" },
    error:  { icon: "cloud_off",         label: "失敗",     cls: "text-[#BF2600]" },
  }[saveStatus];

  return (
    <div className="relative w-full h-full flex flex-col bg-white canvas-panel-root">
      {/* Toolbar overlay — top-right corner, icon-only */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
        {/* Save indicator — icon only */}
        <div
          className={`flex h-7 w-7 items-center justify-center rounded-full bg-white/90 shadow-sm border border-[#DFE1E6] ${saveCfg.cls}`}
          title={saveCfg.label}
        >
          <span className="material-symbols-outlined text-[16px]">{saveCfg.icon}</span>
        </div>
        {/* Fullscreen button — icon only */}
        <Link
          href={`/feedback/tickets/${ticketId}/canvas`}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 hover:bg-white text-[#42526E] hover:text-[#1A1A2E] shadow-sm border border-[#DFE1E6] transition-colors"
          title="全螢幕展開"
        >
          <span className="material-symbols-outlined text-[16px]">open_in_full</span>
        </Link>
      </div>

      {/* Excalidraw fills the panel */}
      <div className="flex-1 relative">
        <Excalidraw
          excalidrawAPI={(api) => { apiRef.current = api; }}
          initialData={initialData}
          onChange={onChange}
          gridModeEnabled
          UIOptions={{
            canvasActions: { loadScene: false },
          }}
        />
      </div>
    </div>
  );
}
