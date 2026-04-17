"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Tldraw, Editor, getSnapshot, loadSnapshot } from "tldraw";
import "tldraw/tldraw.css";
import { createClient } from "@/lib/supabase/client";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export default function CanvasEditorImpl({
  ticketId,
  initialSnapshot,
}: {
  ticketId: string;
  initialSnapshot: unknown;
}) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const editorRef = useRef<Editor | null>(null);
  const saveTimer = useRef<number | null>(null);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    setSaveStatus("saving");
    saveTimer.current = window.setTimeout(async () => {
      const editor = editorRef.current;
      if (!editor) return;
      const snapshot = getSnapshot(editor.store);
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

  const onMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;

      // 開啟 dot grid（Drop.io 那種一格一格的底）
      editor.updateInstanceState({ isGridMode: true });

      // 還原既有 snapshot
      const snap = initialSnapshot as Record<string, unknown> | null | undefined;
      if (snap && typeof snap === "object" && Object.keys(snap).length > 0) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          loadSnapshot(editor.store, snap as any);
        } catch (e) {
          console.error("[feedback] loadSnapshot failed", e);
        }
      }

      // 監聽 user-initiated 文件變更 → debounced 存檔
      const unlisten = editor.store.listen(() => scheduleSave(), {
        scope: "document",
        source: "user",
      });
      return unlisten;
    },
    [initialSnapshot, scheduleSave]
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
        <Tldraw onMount={onMount} />
      </div>
    </div>
  );
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  const cfg = {
    idle:   { icon: "cloud",        label: "就緒",     color: "text-slate-400" },
    saving: { icon: "progress_activity", label: "儲存中…", color: "text-violet-600 animate-pulse" },
    saved:  { icon: "cloud_done",   label: "已儲存",   color: "text-emerald-600" },
    error:  { icon: "cloud_off",    label: "儲存失敗", color: "text-red-600" },
  }[status];
  return (
    <div className={`flex items-center gap-1.5 text-xs font-medium ${cfg.color}`}>
      <span className="material-symbols-outlined text-base">{cfg.icon}</span>
      {cfg.label}
    </div>
  );
}
