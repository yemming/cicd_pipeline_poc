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

export default function CanvasEditorImpl({
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

  // 用 Excalidraw 的 restore 幫我們過濾 / 補齊 appState，避免舊 snapshot 帶壞欄位
  const initialData = useMemo(() => {
    const snap = initialSnapshot as StoredSnapshot | null | undefined;
    const hasElements = snap && Array.isArray(snap.elements) && snap.elements.length >= 0;
    const baseAppState: Partial<AppState> = {
      viewBackgroundColor: "#ffffff",
      gridSize: 20, // Drop.io 那種一格一格的底
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
      // 清掉跨 session 不合理的 ephemeral 欄位
      const { collaborators: _c, ...cleanAppState } = appState;
      void _c;
      const snapshot = { elements, appState: cleanAppState, files };
      const supabase = createClient();
      const { error } = await supabase
        .from("feedback_canvas_snapshots")
        .upsert({ ticket_id: ticketId, snapshot });
      if (error) {
        console.error("[feedback] save failed", error);
        setSaveStatus("error");
      } else {
        setSaveStatus("saved");
      }
    }, 1500);
  }, [ticketId]);

  // Excalidraw onChange 會在滑鼠移動時觸發 — 用 scene version 判定真實變更
  const onChange = useCallback(
    (elements: readonly OrderedExcalidrawElement[]) => {
      const v = getSceneVersion(elements);
      if (v === lastVersionRef.current) return;
      const first = lastVersionRef.current === -1;
      lastVersionRef.current = v;
      if (first) return; // 初次掛載不算變更
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

  return (
    <div className="fixed inset-0 flex flex-col bg-white">
      <header className="h-12 shrink-0 border-b border-slate-200 bg-white flex items-center justify-between px-4 z-10">
        <div className="flex items-center gap-3">
          <Link
            href={`/feedback/tickets/${ticketId}`}
            className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-violet-600 transition-colors"
          >
            <span className="material-symbols-outlined text-lg">arrow_back</span>
            返回單據
          </Link>
          <span className="text-slate-300">/</span>
          <span className="text-sm font-semibold text-slate-700">
            溝通畫布 <span className="font-mono text-slate-400">#{ticketId.slice(0, 6)}</span>
          </span>
        </div>
        <SaveIndicator status={saveStatus} />
      </header>
      <div className="flex-1 relative">
        <Excalidraw
          excalidrawAPI={(api) => {
            apiRef.current = api;
          }}
          initialData={initialData}
          onChange={onChange}
          gridModeEnabled
          langCode="zh-TW"
          UIOptions={{
            canvasActions: {
              loadScene: false, // 我們用 Supabase 持久化，不讓使用者另外載入 .excalidraw 檔干擾
            },
          }}
        />
      </div>
    </div>
  );
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  const cfg = {
    idle:   { icon: "cloud",             label: "就緒",     color: "text-slate-400" },
    saving: { icon: "progress_activity", label: "儲存中…", color: "text-violet-600 animate-pulse" },
    saved:  { icon: "cloud_done",        label: "已儲存",   color: "text-emerald-600" },
    error:  { icon: "cloud_off",         label: "儲存失敗", color: "text-red-600" },
  }[status];
  return (
    <div className={`flex items-center gap-1.5 text-xs font-medium ${cfg.color}`}>
      <span className="material-symbols-outlined text-base">{cfg.icon}</span>
      {cfg.label}
    </div>
  );
}
