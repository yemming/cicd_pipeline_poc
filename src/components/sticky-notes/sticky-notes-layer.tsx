"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  STICKY_COLORS,
  STICKY_COLOR_TONE,
  type StickyColor,
  type StickyNote,
} from "@/lib/sticky-notes";
import {
  createStickyNote,
  updateStickyNote,
  resolveStickyNote,
  deleteStickyNote,
  promoteStickyToTicket,
} from "@/lib/sticky-notes-actions";
import { useIsAdmin } from "@/components/admin-context";

type Mode = "hidden" | "show" | "add";

const NOTE_W = 220;
const NOTE_H = 160;

export function StickyNotesLayer() {
  const pathname = usePathname() || "/";
  const isAdmin = useIsAdmin();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [notes, setNotes] = useState<StickyNote[]>([]);
  const [mode, setMode] = useState<Mode>("show");
  const [showResolved, setShowResolved] = useState(false);
  const [currentUser, setCurrentUser] = useState<string | null>(null);

  // 不在登入頁顯示；非 admin 完全隱藏
  const enabled = pathname !== "/login" && isAdmin;

  // 載入當前頁的 notes + 訂當前 user id
  useEffect(() => {
    if (!enabled) return;
    const sb = createClient();
    let cancelled = false;
    (async () => {
      const { data: { session } } = await sb.auth.getSession();
      const uid = session?.user?.id ?? null;
      if (!cancelled) setCurrentUser(uid);
      const { data } = await sb
        .from("feedback_sticky_notes")
        .select("*")
        .eq("page_path", pathname)
        .order("created_at", { ascending: true });
      if (!cancelled) setNotes((data as StickyNote[]) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, enabled]);

  // Realtime 訂閱當頁的 notes
  useEffect(() => {
    if (!enabled) return;
    const sb = createClient();
    const ch = sb
      .channel(`sticky_notes:${pathname}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "feedback_sticky_notes", filter: `page_path=eq.${pathname}` },
        (payload) => {
          setNotes((prev) => {
            if (payload.eventType === "INSERT") {
              const incoming = payload.new as StickyNote;
              if (prev.some((n) => n.id === incoming.id)) return prev;
              return [...prev, incoming];
            }
            if (payload.eventType === "UPDATE") {
              const incoming = payload.new as StickyNote;
              return prev.map((n) => (n.id === incoming.id ? { ...n, ...incoming } : n));
            }
            if (payload.eventType === "DELETE") {
              const old = payload.old as { id: string };
              return prev.filter((n) => n.id !== old.id);
            }
            return prev;
          });
        },
      )
      .subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  }, [pathname, enabled]);

  // 新增模式：監聽 click 拿座標
  useEffect(() => {
    if (mode !== "add") return;
    function onClick(e: MouseEvent) {
      e.preventDefault();
      e.stopPropagation();
      const x = Math.max(8, e.pageX - NOTE_W / 2);
      const y = Math.max(8, e.pageY - 24);
      // 樂觀新增
      const tempId = `temp-${Date.now()}`;
      const optimistic: StickyNote = {
        id: tempId,
        page_path: pathname,
        page_title: typeof document !== "undefined" ? document.title : null,
        x_px: x,
        y_px: y,
        body: "",
        color: "yellow",
        resolved_at: null,
        created_by: currentUser,
        ticket_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setNotes((prev) => [...prev, optimistic]);
      setMode("show");
      createStickyNote({
        pagePath: pathname,
        pageTitle: optimistic.page_title,
        xPx: x,
        yPx: y,
        body: "",
        color: "yellow",
      })
        .then((real) => {
          if (real) {
            setNotes((prev) => prev.map((n) => (n.id === tempId ? (real as StickyNote) : n)));
          }
        })
        .catch((err) => {
          console.error("[sticky] create failed", err);
          setNotes((prev) => prev.filter((n) => n.id !== tempId));
        });
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMode("show");
    }
    window.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [mode, pathname, currentUser]);

  const visibleNotes = useMemo(
    () => notes.filter((n) => (showResolved ? true : !n.resolved_at)),
    [notes, showResolved],
  );

  const counts = useMemo(() => {
    const total = notes.length;
    const open = notes.filter((n) => !n.resolved_at).length;
    return { total, open };
  }, [notes]);

  const handleLocalChange = useCallback((next: StickyNote) => {
    setNotes((prev) => prev.map((n) => (n.id === next.id ? next : n)));
  }, []);

  const handleLocalRemove = useCallback((id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }, []);

  if (!enabled || !mounted) return null;

  return createPortal(
    <>
      {/* Notes 層：絕對定位掛在 body 0,0；自身 pointer-events:none，個別 note 開 auto */}
      {mode !== "hidden" && (
        <div
          className="absolute top-0 left-0 w-full pointer-events-none z-[60]"
          style={{ height: 0 }}
          data-sticky-layer
        >
          {visibleNotes.map((n) => (
            <StickyNoteCard
              key={n.id}
              note={n}
              currentUser={currentUser}
              onLocalChange={handleLocalChange}
              onLocalRemove={handleLocalRemove}
            />
          ))}
        </div>
      )}

      {/* 新增模式 overlay：cursor crosshair + 半透明遮罩 */}
      {mode === "add" && (
        <div
          className="fixed inset-0 z-[80] cursor-crosshair bg-amber-300/10 backdrop-blur-[1px]"
          data-sticky-add-overlay
        >
          <div className="fixed top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-amber-500 text-white text-sm font-semibold shadow-lg pointer-events-none">
            點擊任何位置貼上便利貼（Esc 取消）
          </div>
        </div>
      )}

      {/* FAB cluster — 右下角 */}
      <div className="fixed bottom-5 right-5 z-[90] flex flex-col items-end gap-2">
        {mode !== "hidden" && (
          <div className="flex flex-col items-end gap-1.5 mb-1">
            <button
              type="button"
              onClick={() => setShowResolved((s) => !s)}
              className="px-2.5 py-1 rounded-full bg-white/95 backdrop-blur shadow-md border border-black/5 text-[11px] font-medium text-on-surface-variant hover:text-on-surface transition"
              title="切換顯示已完成"
            >
              {showResolved ? "已含完成" : "僅未完成"}
            </button>
            <div className="px-2.5 py-1 rounded-full bg-white/95 backdrop-blur shadow-md border border-black/5 text-[11px] text-on-surface-variant">
              此頁 {counts.open} 未完成 / 共 {counts.total}
            </div>
          </div>
        )}

        <div className="flex items-center gap-1.5 bg-white/95 backdrop-blur shadow-lg border border-black/5 rounded-full p-1">
          <button
            type="button"
            onClick={() => setMode(mode === "hidden" ? "show" : "hidden")}
            title={mode === "hidden" ? "顯示便利貼" : "隱藏便利貼"}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-black/5 transition text-on-surface-variant"
          >
            <span className="material-symbols-outlined text-[20px]">
              {mode === "hidden" ? "visibility" : "visibility_off"}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setMode(mode === "add" ? "show" : "add")}
            title={mode === "add" ? "取消新增（Esc）" : "新增便利貼"}
            className={`w-9 h-9 flex items-center justify-center rounded-full transition ${
              mode === "add"
                ? "bg-amber-500 text-white"
                : "bg-[#CC0000] text-white hover:bg-[#a00000]"
            }`}
          >
            <span className="material-symbols-outlined text-[20px]">
              {mode === "add" ? "close" : "sticky_note_2"}
            </span>
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}

// ──────────────────────────────────────────────────────────────────
// 單張便利貼

function StickyNoteCard({
  note,
  currentUser,
  onLocalChange,
  onLocalRemove,
}: {
  note: StickyNote;
  currentUser: string | null;
  onLocalChange: (n: StickyNote) => void;
  onLocalRemove: (id: string) => void;
}) {
  const tone = STICKY_COLOR_TONE[note.color] ?? STICKY_COLOR_TONE.yellow;
  const [body, setBody] = useState(note.body);
  const [lastSyncedBody, setLastSyncedBody] = useState(note.body);
  const [editing, setEditing] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [pending, startTransition] = useTransition();
  const [savingBody, setSavingBody] = useState(false);
  const router = useRouter();

  // 同步 prop → state（remote/realtime 更新）— React 19 推薦的「render 期間比對」pattern
  if (!editing && note.body !== lastSyncedBody) {
    setLastSyncedBody(note.body);
    setBody(note.body);
  }

  const isOptimistic = note.id.startsWith("temp-");
  const canDelete = currentUser && (note.created_by === currentUser);
  const resolved = !!note.resolved_at;

  // 拖曳
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [draggingPos, setDraggingPos] = useState<{ x: number; y: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isOptimistic || editing) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-no-drag]")) return;
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: Number(note.x_px),
      origY: Number(note.y_px),
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setDraggingPos({
      x: Math.max(0, dragRef.current.origX + dx),
      y: Math.max(0, dragRef.current.origY + dy),
    });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    dragRef.current = null;
    setDraggingPos(null);
    if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return; // treat as click
    const newX = Math.max(0, Number(note.x_px) + dx);
    const newY = Math.max(0, Number(note.y_px) + dy);
    onLocalChange({ ...note, x_px: newX, y_px: newY });
    startTransition(() => {
      updateStickyNote(note.id, { xPx: newX, yPx: newY }).catch((err) => {
        console.error("[sticky] move failed", err);
      });
    });
  };

  const commitBody = () => {
    setEditing(false);
    if (body === note.body) return;
    setSavingBody(true);
    onLocalChange({ ...note, body });
    updateStickyNote(note.id, { body })
      .catch((err) => console.error("[sticky] body save failed", err))
      .finally(() => setSavingBody(false));
  };

  const setColor = (c: StickyColor) => {
    setShowColorPicker(false);
    if (c === note.color) return;
    onLocalChange({ ...note, color: c });
    startTransition(() => {
      updateStickyNote(note.id, { color: c }).catch((err) =>
        console.error("[sticky] color save failed", err),
      );
    });
  };

  const toggleResolved = () => {
    onLocalChange({ ...note, resolved_at: resolved ? null : new Date().toISOString() });
    startTransition(() => {
      resolveStickyNote(note.id, !resolved).catch((err) =>
        console.error("[sticky] resolve failed", err),
      );
    });
  };

  const remove = () => {
    if (!confirm("刪除這張便利貼？")) return;
    onLocalRemove(note.id);
    startTransition(() => {
      deleteStickyNote(note.id).catch((err) => {
        console.error("[sticky] delete failed", err);
        alert("刪除失敗：" + (err as Error).message);
      });
    });
  };

  const promote = () => {
    if (note.ticket_id) {
      router.push(`/feedback/tickets/${note.ticket_id}`);
      return;
    }
    if (!body.trim()) {
      alert("請先寫點內容再轉成許願單");
      return;
    }
    startTransition(async () => {
      try {
        const { ticketId } = await promoteStickyToTicket(note.id);
        onLocalChange({ ...note, ticket_id: ticketId });
        router.push(`/feedback/tickets/${ticketId}`);
      } catch (err) {
        alert("轉許願單失敗：" + (err as Error).message);
      }
    });
  };

  const x = draggingPos?.x ?? Number(note.x_px);
  const y = draggingPos?.y ?? Number(note.y_px);

  return (
    <div
      className={`absolute pointer-events-auto select-none transition-shadow ${
        resolved ? "opacity-60" : ""
      } ${draggingPos ? "shadow-2xl scale-[1.02]" : "shadow-md hover:shadow-lg"}`}
      style={{
        left: x,
        top: y,
        width: NOTE_W,
        transform: `rotate(${(parseInt(note.id.slice(0, 4), 16) % 5) - 2}deg)`,
        transition: draggingPos ? "none" : "transform 0.15s ease, box-shadow 0.15s ease",
      }}
    >
      {/* 標籤條（拖曳手把） */}
      <div
        className={`flex items-center justify-between px-2 py-1 rounded-t-md cursor-grab active:cursor-grabbing ${tone.tab} ${tone.text}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div className="flex items-center gap-1 text-[11px] font-semibold">
          <span className="material-symbols-outlined text-[14px]">drag_indicator</span>
          <span>{resolved ? "✓ 已完成" : isOptimistic ? "建立中…" : "便利貼"}</span>
          {note.ticket_id && (
            <span className="ml-1 px-1 py-px rounded bg-white/40 text-[10px]">許願單</span>
          )}
          {(pending || savingBody) && (
            <span
              className="inline-block w-3 h-3 ml-1 border-2 border-current border-b-transparent border-r-transparent rounded-full animate-spin opacity-80"
              aria-hidden
            />
          )}
        </div>
        <div className="flex items-center gap-0.5" data-no-drag>
          <button
            type="button"
            onClick={toggleResolved}
            title={resolved ? "標記為未完成" : "標記為完成"}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/40 transition"
          >
            <span className="material-symbols-outlined text-[14px]">
              {resolved ? "radio_button_unchecked" : "task_alt"}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setShowColorPicker((s) => !s)}
            title="改顏色"
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/40 transition"
          >
            <span className="material-symbols-outlined text-[14px]">palette</span>
          </button>
          <button
            type="button"
            onClick={promote}
            title={note.ticket_id ? "前往許願單" : "轉成許願單"}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/40 transition"
          >
            <span className="material-symbols-outlined text-[14px]">
              {note.ticket_id ? "open_in_new" : "north_east"}
            </span>
          </button>
          {canDelete && (
            <button
              type="button"
              onClick={remove}
              title="刪除"
              className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/40 transition"
            >
              <span className="material-symbols-outlined text-[14px]">delete</span>
            </button>
          )}
        </div>
      </div>

      {/* 顏色 picker */}
      {showColorPicker && (
        <div
          className={`flex items-center gap-1 px-2 py-1 ${tone.bg} border-x ${tone.border}`}
          data-no-drag
        >
          {STICKY_COLORS.map((c) => {
            const t = STICKY_COLOR_TONE[c];
            return (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-5 h-5 rounded-full ${t.tab} border ${
                  c === note.color ? "ring-2 ring-black/40" : "border-black/10"
                } hover:scale-110 transition`}
                title={c}
              />
            );
          })}
        </div>
      )}

      {/* 內文（雙擊或點 placeholder 進入編輯） */}
      <div
        className={`px-3 py-2 rounded-b-md ${tone.bg} ${tone.text} border ${tone.border}`}
        style={{ minHeight: NOTE_H - 28 }}
        data-no-drag
      >
        {editing ? (
          <textarea
            autoFocus
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onBlur={commitBody}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                commitBody();
              } else if (e.key === "Escape") {
                setBody(note.body);
                setEditing(false);
              }
            }}
            placeholder="寫點什麼…  (⌘/Ctrl+Enter 儲存)"
            className={`w-full bg-transparent resize-none outline-none text-sm leading-snug ${tone.text} placeholder:opacity-50`}
            rows={5}
          />
        ) : (
          <div
            onDoubleClick={() => setEditing(true)}
            onClick={(e) => {
              if (!body) {
                e.stopPropagation();
                setEditing(true);
              }
            }}
            className={`text-sm leading-snug whitespace-pre-wrap break-words cursor-text min-h-[80px] ${
              !body ? "opacity-50 italic" : ""
            } ${resolved ? "line-through" : ""}`}
          >
            {body || "雙擊輸入內容…"}
          </div>
        )}
        <div className="mt-1 text-[10px] opacity-50 text-right">
          {new Date(note.updated_at).toLocaleString("zh-TW", {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>
    </div>
  );
}
