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

export default function CanvasPanelImpl({
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
    setStatus(error ? "error" : "saved");
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

  // 未儲存時攔截關分頁 / 重整（Next client-side 導航不會觸發 beforeunload，
  // 但 tab close / reload / 關視窗 都會跳瀏覽器原生確認對話框）
  useEffect(() => {
    if (status !== "dirty") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [status]);

  // onChange 只標 dirty，不再自動寫 DB（降低連線消耗）
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
    <div className="relative w-full h-full flex flex-col bg-white canvas-panel-root">
      {/* Canvas header bar — 獨立的 header，不用 absolute overlay（會被 Excalidraw 新版右上側欄蓋掉） */}
      <div className="flex items-center justify-between gap-2 px-3 h-10 border-b border-[#DFE1E6] bg-white shrink-0">
        <div className="flex items-center gap-1.5 text-[12px] font-bold text-[#6B778C] uppercase tracking-wider">
          <span className="material-symbols-outlined text-[15px] text-[#0052CC]">gesture</span>
          畫布
        </div>
        <div className="flex items-center gap-2">
          <StatusLabel status={status} />
          <SaveButton status={status} onClick={save} />
          <Link
            href={`/feedback/tickets/${ticketId}/canvas`}
            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded border border-[#DFE1E6] text-[#172B4D] bg-white hover:bg-[#F4F5F7] transition-colors"
            title="全螢幕展開"
          >
            <span className="material-symbols-outlined text-[14px]">open_in_full</span>
            最大化
          </Link>
        </div>
      </div>

      <div className="flex-1 relative min-h-0">
        <Excalidraw
          excalidrawAPI={(api) => { apiRef.current = api; }}
          initialData={initialData}
          onChange={onChange}
          gridModeEnabled
          langCode="zh-TW"
          UIOptions={{
            canvasActions: { loadScene: false },
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
    <div className={`inline-flex items-center gap-1 text-[11px] ${cfg.cls}`} title={cfg.label}>
      <span className="material-symbols-outlined text-[14px]">{cfg.icon}</span>
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
      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded transition-colors ${
        disabled
          ? "border border-[#DFE1E6] text-[#6B778C] bg-white cursor-not-allowed"
          : "bg-[#0052CC] hover:bg-[#0747A6] text-white"
      }`}
    >
      <span className="material-symbols-outlined text-[14px]">save</span>
      {label}
    </button>
  );
}
