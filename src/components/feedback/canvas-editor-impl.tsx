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

type SaveStatus = "saved" | "dirty" | "saving" | "error";

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
  const [status, setStatus] = useState<SaveStatus>("saved");
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const lastVersionRef = useRef<number>(-1);

  const initialData = useMemo(() => {
    const snap = initialSnapshot as StoredSnapshot | null | undefined;
    const hasElements = snap && Array.isArray(snap.elements) && snap.elements.length >= 0;
    const baseAppState: Partial<AppState> = {
      viewBackgroundColor: "#ffffff",
      gridSize: 20,
      openSidebar: null, // 不自動展開 Library 側欄
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

  const save = useCallback(async () => {
    const api = apiRef.current;
    if (!api) return;
    setStatus("saving");
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
    if (error) {
      console.error("[feedback] save failed", error);
      setStatus("error");
    } else {
      setStatus("saved");
    }
  }, [ticketId]);

  // Cmd/Ctrl+S 存檔；在 capture 階段攔截，蓋掉 Excalidraw 自帶的「另存 .excalidraw」與瀏覽器存網頁
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        e.stopPropagation();
        void save();
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [save]);

  useEffect(() => {
    if (status !== "dirty") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [status]);

  const onChange = useCallback(
    (elements: readonly OrderedExcalidrawElement[]) => {
      const v = getSceneVersion(elements);
      if (v === lastVersionRef.current) return;
      const first = lastVersionRef.current === -1;
      lastVersionRef.current = v;
      if (first) return;
      setStatus((prev) => (prev === "saving" ? prev : "dirty"));
    },
    []
  );

  return (
    <div className="canvas-editor-root fixed inset-0 flex flex-col bg-white">
      <header className="h-12 shrink-0 border-b border-[#DFE1E6] bg-white flex items-center justify-between px-4 z-10">
        <div className="flex items-center gap-3">
          <Link
            href={`/feedback/tickets/${ticketId}`}
            className="flex items-center gap-1.5 text-sm text-[#6B778C] hover:text-[#0052CC] transition-colors"
          >
            <span className="material-symbols-outlined text-lg">arrow_back</span>
            返回單據
          </Link>
          <span className="text-[#DFE1E6]">/</span>
          <span className="text-sm font-semibold text-[#172B4D]">
            溝通畫布 <span className="font-mono text-[#8993A4]">#{ticketId.slice(0, 6)}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <StatusLabel status={status} />
          <SaveButton status={status} onClick={save} />
        </div>
      </header>
      <div className="flex-1 relative">
        <Excalidraw
          excalidrawAPI={(api) => { apiRef.current = api; }}
          initialData={initialData}
          onChange={onChange}
          gridModeEnabled
          langCode="zh-TW"
          UIOptions={{
            canvasActions: {
              loadScene: false,
            },
          }}
        />
      </div>
    </div>
  );
}

function StatusLabel({ status }: { status: SaveStatus }) {
  const cfg = {
    saved:  { icon: "cloud_done",        label: "已儲存",   cls: "text-[#36B37E]" },
    dirty:  { icon: "cloud_upload",      label: "尚未儲存", cls: "text-[#FF8B00]" },
    saving: { icon: "progress_activity", label: "儲存中…", cls: "text-[#0052CC] animate-pulse" },
    error:  { icon: "cloud_off",         label: "失敗",     cls: "text-[#BF2600]" },
  }[status];
  return (
    <div className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.cls}`} title={cfg.label}>
      <span className="material-symbols-outlined text-base">{cfg.icon}</span>
      {cfg.label}
    </div>
  );
}

function SaveButton({ status, onClick }: { status: SaveStatus; onClick: () => void }) {
  const disabled = status === "saved" || status === "saving";
  const label = status === "saving" ? "儲存中…" : status === "error" ? "重試儲存" : "儲存";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title="儲存（⌘/Ctrl+S）"
      className={`inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded transition-colors ${
        disabled
          ? "border border-[#DFE1E6] text-[#6B778C] bg-white cursor-not-allowed"
          : "bg-[#0052CC] hover:bg-[#0747A6] text-white"
      }`}
    >
      <span className="material-symbols-outlined text-base">save</span>
      {label}
    </button>
  );
}
